# Packaged diagnostics secrets

CI writes `capability-secret.txt` here before `electron-builder` runs.
That file is copied into the Windows installer as
`resources/diagnostics-secrets/capability-secret.txt`.

The value must match the Worker secret `DIAGNOSTICS_CAPABILITY_SECRET` so
clear-DTC capability tokens signed by the API verify on the desktop J2534 host.

Do not commit production secret values.
