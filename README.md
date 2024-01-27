# Cloud Run Service library

## Setup

1. `yarn setup`
1. Install recommended vscode extensions
   - Open the Extensions tab in vscode
   - In the filter box, type "@recommended" and press enter to search
   - Make sure all recommended extensions are installed

## Requirements

- Must run with a service account named
  `cr-${process.env.SERVICE}@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com`
  with at least these permissions (along with whatever else your service
  requires):
  - `roles/run.invoker` - if the service needs to call other services
  - `cloudtasks.tasks.create` - if the service needs to enqueue tasks
    - roles/iam.serviceAccountUser - if the tasks need to be able to invoke an
      internal cloud run service (i.e., one which restricts invokers to
      specific service accounts, to include this service's account)

- Environment variables:
  - Required:
    - `GCLOUD_PROJECT` - the project ID this service is running in; must end in
      `-dev` or `-prod`
    - `GIT_HASH` - the commit from which the current code was generated
    - `K_REVISION` - provided by cloud run (the revision ID)
      - When running a local server, it will be `localhost`
      - When running it unit tests, it should be`unittest`
        - If this is `unittest` then `isUnitTesting` will be true.
    - `NODE_ENV`
      - If this is `localhost` then `isLocalhost` will be true.
      - If this is `dev` then `isDev` will be true.
      - If this is `prod` then `isProd` will be true.
    - `REGION` - the region this service's cloud run is located in
    - `SERVICE` - the name of this service
  - Optional:
    - `CLOUD_RUN_HOSTNAME_SUFFIX` - the hostname of our cloud run instances in
      this region, excluding the `SERVICE` name portion at the beginning. Only
      required if using the `callServiceAPI()` function.
    - `COOKIE_SECRET` - used to sign cookie data (cookies are disabled if omitted)
    - `PORT` - defaults to 8080 if omitted
    - `SENTRY_DSN` - the Sentry URL to report errors to (not used on localhost)
