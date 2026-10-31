function(evfx_site_after_build target)
  if(NOT TARGET "${target}" OR EVFX_SITE_SKIP_PUBLISH)
    return()
  endif()
  get_target_property(evfx_hook_added "${target}" EVFX_SITE_HOOK_ADDED)
  if(evfx_hook_added)
    return()
  endif()
  find_program(EVFX_SITE_NODE NAMES node.exe node)
  if(NOT EVFX_SITE_NODE)
    return()
  endif()
  set_property(TARGET "${target}" PROPERTY EVFX_SITE_HOOK_ADDED TRUE)
  if(NOT EVFX_SITE_SYNC_SCRIPT)
    set(EVFX_SITE_SYNC_SCRIPT "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/sync-after-build.mjs")
  endif()
  set(evfx_project "${CMAKE_CURRENT_SOURCE_DIR}")
  if(ARGC GREATER 1)
    set(evfx_project "${ARGV1}")
  endif()
  add_custom_command(TARGET "${target}" POST_BUILD
    COMMAND "${CMAKE_COMMAND}"
      "-DEVFX_SITE_CONFIG=$<CONFIG>"
      "-DEVFX_SITE_PROJECT=${evfx_project}"
      "-DEVFX_SITE_ARTIFACT=$<TARGET_FILE:${target}>"
      "-DEVFX_SITE_NODE=${EVFX_SITE_NODE}"
      "-DEVFX_SITE_SCRIPT=${EVFX_SITE_SYNC_SCRIPT}"
      -P "${CMAKE_CURRENT_FUNCTION_LIST_DIR}/RunAfterBuild.cmake"
    COMMENT "Publish EVFX release build"
    VERBATIM)
endfunction()

function(evfx_site_after_builds project_dir)
  get_property(evfx_targets DIRECTORY PROPERTY BUILDSYSTEM_TARGETS)
  foreach(evfx_target IN LISTS evfx_targets)
    get_target_property(evfx_suffix "${evfx_target}" SUFFIX)
    if(evfx_suffix STREQUAL ".aex")
      evfx_site_after_build("${evfx_target}" "${project_dir}")
    endif()
  endforeach()
endfunction()
