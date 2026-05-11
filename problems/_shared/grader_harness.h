// CS 225 POTD — Grader harness
//
// Each test runs in a forked child process. A segfault, abort, or infinite
// loop in test N does not kill tests N+1...M. Results are reported via
// sentinel-wrapped lines that the backend parses without confusing them
// with the student's own stdout.
//
// Sentinel format (parsed by api/src/execution/sentinel.ts):
//   <<<POTD-TEST name="..." status=pass>>>
//   <<<POTD-TEST name="..." status=fail message="...">>>
//   <<<POTD-RESULT tests-passed=N tests-total=M>>>
//
// Usage:
//   #include "grader_harness.h"
//
//   POTD_TEST("hours(3600) == 1") {
//       POTD_ASSERT_EQ(hours(3600), 1);
//   }
//   POTD_TEST("days(86400) == 1") {
//       POTD_ASSERT_EQ(days(86400), 1);
//   }
//   int main() { return potd::run_all(); }

#pragma once

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

namespace potd {

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

inline void emit_test_event(const char* name, const char* status, const std::string& message = "") {
    std::string escaped;
    for (char c : message) {
        if (c == '"') escaped += "\\\"";
        else if (c == '\n') escaped += ' ';
        else escaped += c;
    }
    if (message.empty()) {
        std::printf("<<<POTD-TEST name=\"%s\" status=%s>>>\n", name, status);
    } else {
        std::printf("<<<POTD-TEST name=\"%s\" status=%s message=\"%s\">>>\n",
                    name, status, escaped.c_str());
    }
    std::fflush(stdout);
}

inline void emit_result(int passed, int total) {
    std::printf("<<<POTD-RESULT tests-passed=%d tests-total=%d>>>\n", passed, total);
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
    while ((n = read(pipefd[0], buf, sizeof(buf))) > 0) {
        captured.append(buf, static_cast<size_t>(n));
    }
    close(pipefd[0]);

    int status = 0;
    waitpid(pid, &status, 0);

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

}  // namespace potd

// ────────────────────────────────────────────────────────────────────────────
// Macros
// ────────────────────────────────────────────────────────────────────────────
#define POTD_CONCAT_INNER(a, b) a##b
#define POTD_CONCAT(a, b) POTD_CONCAT_INNER(a, b)

#define POTD_TEST(NAME)                                                          \
    static void POTD_CONCAT(potd_test_fn_, __LINE__)();                          \
    static ::potd::Register POTD_CONCAT(potd_test_reg_, __LINE__)(               \
        NAME, &POTD_CONCAT(potd_test_fn_, __LINE__));                            \
    static void POTD_CONCAT(potd_test_fn_, __LINE__)()

#define POTD_FAIL(MSG)                                                           \
    do {                                                                         \
        std::ostringstream _oss;                                                 \
        _oss << MSG;                                                             \
        throw ::potd::AssertionFailure{_oss.str()};                              \
    } while (0)

#define POTD_ASSERT(COND)                                                        \
    do {                                                                         \
        if (!(COND)) POTD_FAIL("assertion failed: " #COND);                      \
    } while (0)

#define POTD_ASSERT_EQ(ACTUAL, EXPECTED)                                         \
    do {                                                                         \
        auto _a = (ACTUAL);                                                      \
        auto _e = (EXPECTED);                                                    \
        if (!(_a == _e)) {                                                       \
            POTD_FAIL("expected " #ACTUAL " == " #EXPECTED                       \
                      ": got " << _a << ", expected " << _e);                    \
        }                                                                        \
    } while (0)

#define POTD_ASSERT_NE(ACTUAL, EXPECTED)                                         \
    do {                                                                         \
        auto _a = (ACTUAL);                                                      \
        auto _e = (EXPECTED);                                                    \
        if (!(_a != _e)) {                                                       \
            POTD_FAIL("expected " #ACTUAL " != " #EXPECTED                       \
                      ": both = " << _a);                                        \
        }                                                                        \
    } while (0)

#define POTD_ASSERT_TRUE(COND)  POTD_ASSERT(COND)
#define POTD_ASSERT_FALSE(COND) POTD_ASSERT(!(COND))
