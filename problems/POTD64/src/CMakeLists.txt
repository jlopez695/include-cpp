# Path definitions.
set(src_dir ${CMAKE_CURRENT_SOURCE_DIR})

# Add overall src library.
#
# STATIC is explicit even though CMake's add_library default is STATIC
# when BUILD_SHARED_LIBS is unset — because that default flips to SHARED
# the moment any caller (a developer doing a one-off ccmake toggle, a
# parent CI matrix that runs every project with -DBUILD_SHARED_LIBS=ON
# for ABI testing, a future top-level CMakeLists adding the flag) sets
# it. Under SHARED the entry executables and the Catch2 test executable
# would need an rpath into the build directory to find libsrc.so at run
# time; the cmake-runner harness's spawnLimited / ulimit -v invocation
# inherits no such rpath and would resurface as a load-time link error
# right after a clean `[100%] Built target` line. Pin STATIC here so
# this problem's link layout is invariant of any global toggle.
file(GLOB_RECURSE src_sources CONFIGURE_DEPENDS ${src_dir}/*.cpp)
add_library(src STATIC ${src_sources})
target_include_directories(src PUBLIC ${src_dir})
