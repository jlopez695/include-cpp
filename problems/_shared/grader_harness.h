// Grader harness
//
// Each test runs in a forked child process. A segfault, abort, or infinite
// loop in test N does not kill tests N+1...M. Results are reported via
// sentinel-wrapped lines that the backend parses without confusing them
// with the student's own stdout.
//
// Sentinel format (parsed by api/src/execution/sentinel.ts):
//   <<<GRADER-TEST name="..." status=pass>>>
//   <<<GRADER-TEST name="..." status=fail message="...">>>
//   <<<GRADER-RESULT tests-passed=N tests-total=M>>>
//
// Usage:
//   #include "grader_harness.h"
//
//   GRADER_TEST("hours(3600) == 1") {
//       GRADER_ASSERT_EQ(hours(3600), 1);
//   }
//   GRADER_TEST("days(86400) == 1") {
//       GRADER_ASSERT_EQ(days(86400), 1);
//   }
//   int main() { return grader::run_all(); }

#pragma once

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <string>
#include <sstream>
#include <vector>
#include <functional>
#include <sys/wait.h>
#include <unistd.h>
#include <signal.h>

namespace grader {

struct Test {
    const char* name;
    std::function<void()> body;
};

inline std::vector<Test>& registry() {
    static std::vector<Test> r;
    return r;
}

struct Register {
    Register(const char* name, std::function<void()> body) {
        registry().push_back({name, std::move(body)});
    }
};

// ────────────────────────────────────────────────────────────────────────────
// Assertion failure carries a message back to the parent via the child's
// stderr (which we capture through a pipe).
// ────────────────────────────────────────────────────────────────────────────
struct AssertionFailure {
    std::string message;
};

// Escape one sentinel attribute value. Three rules, all of them load-bearing
// for the parser in api/src/execution/sentinel.ts:
//
//   1. `"` → `\"`   — parseKv reads quoted values with
//                      /"((?:[^"\\]|\\.)*)"/, so an unescaped quote ends
//                      the value early.
//   2. newline → ' ' — a sentinel is a single line by construction.
//   3. `>>>` → `>> >` — the non-greedy SENTINEL_RE close-marker latches onto
//                      the FIRST `>>>` after the open, so a literal run of
//                      three would terminate the sentinel mid-body. Inserting
//                      a space between the 2nd and 3rd `>` keeps the text
//                      reading as three `>` characters while removing the
//                      substring. Single `>` and `>>` runs are legal body
//                      content and are left alone.
//
// This pass used to be inlined in emit_test_event and applied to `message`
// ONLY. A test whose NAME contained a quote — e.g. GRADER_TEST("FizzBuzz(3) ==
// \"Fizz\"") — emitted
//     <<<GRADER-TEST name="FizzBuzz(3) == "Fizz"" status=pass>>>
// and parseKv ended the name at the second quote, so the UI rendered the row
// as `FizzBuzz(3) == ` with the rest silently dropped. `status` still parsed
// (the scan resumes past the short match), so the test's pass/fail outcome was
// correct and only the label was mangled — which made it look like a harness
// bug rather than anything to do with the name. A name containing `>>>` was
// worse: it truncated the whole sentinel and leaked the tail into the user's
// output panel. Both names and messages are author-controlled, so this is a
// correctness/legibility fix, not a security boundary.
inline std::string escape_sentinel_value(const std::string& raw) {
    std::string escaped;
    for (char c : raw) {
        if (c == '"') escaped += "\\\"";
        else if (c == '\n') escaped += ' ';
        else escaped += c;
    }
    size_t pos = 0;
    while ((pos = escaped.find(">>>", pos)) != std::string::npos) {
        escaped.replace(pos, 3, ">> >");
        pos += 4;
    }
    return escaped;
}

inline void emit_test_event(const char* name, const char* status, const std::string& message = "") {
    const std::string safe_name = escape_sentinel_value(name);
    if (message.empty()) {
        std::printf("<<<GRADER-TEST name=\"%s\" status=%s>>>\n", safe_name.c_str(), status);
    } else {
        std::printf("<<<GRADER-TEST name=\"%s\" status=%s message=\"%s\">>>\n",
                    safe_name.c_str(), status, escape_sentinel_value(message).c_str());
    }
    std::fflush(stdout);
}

inline void emit_result(int passed, int total) {
    std::printf("<<<GRADER-RESULT tests-passed=%d tests-total=%d>>>\n", passed, total);
    std::fflush(stdout);
}

// ────────────────────────────────────────────────────────────────────────────
// Run a single test in a forked child. Captures the child's stderr into a
// string so any assertion message survives back to the parent. Returns
// (passed, optional message).
// ────────────────────────────────────────────────────────────────────────────
struct ChildResult {
    bool passed;
    std::string message;
    bool crashed;
};

inline ChildResult run_in_child(const Test& t) {
    int pipefd[2];
    if (pipe(pipefd) != 0) {
        return {false, "pipe() failed", true};
    }

    pid_t pid = fork();
    if (pid < 0) {
        close(pipefd[0]);
        close(pipefd[1]);
        return {false, "fork() failed", true};
    }

    if (pid == 0) {
        // Child: redirect stderr into the pipe so we can read failure messages.
        close(pipefd[0]);
        dup2(pipefd[1], STDERR_FILENO);
        close(pipefd[1]);

        try {
            t.body();
            std::_Exit(0);
        } catch (const AssertionFailure& f) {
            std::fputs(f.message.c_str(), stderr);
            std::_Exit(1);
        } catch (const std::exception& e) {
            std::fputs("uncaught exception: ", stderr);
            std::fputs(e.what(), stderr);
            std::_Exit(2);
        } catch (...) {
            std::fputs("uncaught non-std exception", stderr);
            std::_Exit(3);
        }
    }

    // Parent
    close(pipefd[1]);
    std::string captured;
    char buf[4096];
    ssize_t n;
    // Cap the captured stderr at 64KB. The pre-cap loop appended every
    // byte the child wrote to stderr into a single std::string — under
    // the parent grader's RLIMIT_AS = 512MB (spawnLimited's ulimit -v
    // 524288) a runaway test that loops printing into stderr would
    // eventually hit std::bad_alloc inside std::string::append. The
    // read() loop runs OUTSIDE the run_in_child try block, so the
    // bad_alloc escapes, std::terminate aborts the entire grader
    // process before the result sentinel is emitted, and the SSE
    // `done` event lands with `{passed:0, total:0}` — user sees "0/0
    // tests passed" with an empty output panel and no clue what
    // happened. In practice the 30s wall timeout often fires first
    // and SIGKILLs the grader to the same opaque effect. Capping
    // keeps memory bounded, lets the test that crashed actually
    // report its outcome, and preserves the most useful prefix of
    // the child's stderr (assertion messages are short — the prefix
    // is the part the user needs). Keep draining past the cap so
    // the child doesn't SIGPIPE on its next write into the pipe.
    static const size_t MAX_CAPTURED = 64 * 1024;
    bool truncated = false;
    // EINTR-retry loop. A signal arriving mid-read returns -1 with
    // errno == EINTR — the old `while (n > 0)` shape treated that the
    // same as end-of-stream, silently truncating the child's stderr
    // and producing an empty/partial assertion message back to the
    // user. SIGCHLD from a sibling test is the most common interrupter
    // (this runs from inside grader::run_all which is forking children
    // back-to-back), but any signal the OS delivers to the grader
    // process can trip it. Retry on EINTR and only terminate on real
    // EOF (n == 0) or a non-EINTR error.
    for (;;) {
        n = read(pipefd[0], buf, sizeof(buf));
        if (n > 0) {
            if (captured.size() < MAX_CAPTURED) {
                const size_t take = std::min(static_cast<size_t>(n),
                                              MAX_CAPTURED - captured.size());
                captured.append(buf, take);
                if (captured.size() == MAX_CAPTURED) truncated = true;
            }
            continue;
        }
        if (n == -1 && errno == EINTR) continue;
        break;
    }
    if (truncated) captured += "\n[stderr truncated at 64KB]";
    close(pipefd[0]);

    int status = 0;
    pid_t w;
    // EINTR-retry loop. A signal arriving mid-waitpid returns -1
    // with errno == EINTR and leaves `status` at its initialized 0.
    // Falling through to WIFEXITED(0) then returns `true` (since
    // ((0 & 0x7f) == 0) is true) with WEXITSTATUS(0) == 0 — i.e. a
    // test that may have actually crashed (or simply was never
    // reaped) gets silently scored as a PASS. That's the worst
    // failure mode in an autograder: students see a green checkmark
    // for broken code. Retry on EINTR; bail with a crash-shaped
    // result only on a non-EINTR error.
    do { w = waitpid(pid, &status, 0); } while (w == -1 && errno == EINTR);
    if (w == -1) {
        return {false, "waitpid() failed", true};
    }

    if (WIFEXITED(status)) {
        const int code = WEXITSTATUS(status);
        if (code == 0) return {true, "", false};
        return {false, captured.empty() ? "test exited non-zero" : captured, false};
    }
    if (WIFSIGNALED(status)) {
        const int sig = WTERMSIG(status);
        std::ostringstream oss;
        oss << "crashed with signal " << sig << " (" << strsignal(sig) << ")";
        if (!captured.empty()) oss << ": " << captured;
        return {false, oss.str(), true};
    }
    return {false, "unknown child exit", true};
}

inline int run_all() {
    int passed = 0;
    int total = static_cast<int>(registry().size());
    for (const Test& t : registry()) {
        ChildResult r = run_in_child(t);
        if (r.passed) {
            ++passed;
            emit_test_event(t.name, "pass");
        } else {
            emit_test_event(t.name, r.crashed ? "crash" : "fail", r.message);
        }
    }
    emit_result(passed, total);
    return passed == total ? 0 : 1;
}

}  // namespace grader

// ────────────────────────────────────────────────────────────────────────────
// Macros
// ────────────────────────────────────────────────────────────────────────────
#define GRADER_CONCAT_INNER(a, b) a##b
#define GRADER_CONCAT(a, b) GRADER_CONCAT_INNER(a, b)

#define GRADER_TEST(NAME)                                                          \
    static void GRADER_CONCAT(grader_test_fn_, __LINE__)();                          \
    static ::grader::Register GRADER_CONCAT(grader_test_reg_, __LINE__)(               \
        NAME, &GRADER_CONCAT(grader_test_fn_, __LINE__));                            \
    static void GRADER_CONCAT(grader_test_fn_, __LINE__)()

#define GRADER_FAIL(MSG)                                                           \
    do {                                                                         \
        std::ostringstream _oss;                                                 \
        _oss << MSG;                                                             \
        throw ::grader::AssertionFailure{_oss.str()};                              \
    } while (0)

#define GRADER_ASSERT(COND)                                                        \
    do {                                                                         \
        if (!(COND)) GRADER_FAIL("assertion failed: " #COND);                      \
    } while (0)

#define GRADER_ASSERT_EQ(ACTUAL, EXPECTED)                                         \
    do {                                                                         \
        auto _a = (ACTUAL);                                                      \
        auto _e = (EXPECTED);                                                    \
        if (!(_a == _e)) {                                                       \
            GRADER_FAIL("expected " #ACTUAL " == " #EXPECTED                       \
                      ": got " << _a << ", expected " << _e);                    \
        }                                                                        \
    } while (0)

#define GRADER_ASSERT_NE(ACTUAL, EXPECTED)                                         \
    do {                                                                         \
        auto _a = (ACTUAL);                                                      \
        auto _e = (EXPECTED);                                                    \
        if (!(_a != _e)) {                                                       \
            GRADER_FAIL("expected " #ACTUAL " != " #EXPECTED                       \
                      ": both = " << _a);                                        \
        }                                                                        \
    } while (0)

#define GRADER_ASSERT_TRUE(COND)  GRADER_ASSERT(COND)
#define GRADER_ASSERT_FALSE(COND) GRADER_ASSERT(!(COND))
