if(NOT EVFX_SITE_CONFIG STREQUAL "Release" OR NOT EVFX_SITE_ARTIFACT MATCHES "\\.aex$" OR NOT EXISTS "${EVFX_SITE_SCRIPT}")
  return()
endif()
execute_process(COMMAND "${EVFX_SITE_NODE}" "${EVFX_SITE_SCRIPT}"
  --project "${EVFX_SITE_PROJECT}" --artifact "${EVFX_SITE_ARTIFACT}"
  RESULT_VARIABLE evfx_result)
if(NOT evfx_result EQUAL 0)
  message(WARNING "Build succeeded; EVFX site publication will retry on the next build.")
endif()
