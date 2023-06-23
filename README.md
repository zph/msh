# msh - mongo shell for large clusters

Mongo shell helper to auto-discover mongo cluster nodes, display their shard and
state (PRIMARY/SECONDARY) and prompt for which to connect to.

Stop trying to remember all your pet mongods in large clusters and let
introspection do the work!

# Installation

Depends on deno 1.32+ and cannot be single binary compiled due to
https://github.com/denoland/deno/issues/16632 as of 2023-06. Instead use
`deno install`.

```
wget https://raw.githubusercontent.com/zph/msh/main/main.ts
deno install --allow-all --unstable -f --name msh ./main.ts
```

Add that deno install path to your $PATH

Setup necessary environmental variables

```
# .envrc or shell init
export MONGO_USER=
export MONGO_PASSWORD=
export MONGO_AUTH_DB=admin
# MONGOS_BY_ENV is a k/v pair of env name to one URI for mongos node
export MONGOS_BY_ENV='{"local": "localhost:27017", "production": "mongodb-prod-mongos.company.internal:27017"}'
# Use alternative env var names for fetching these values
export MSH_ENV_VAR_OVERRIDE='{"MONGO_USER": "MUSER", "MONGO_PASSWORD": MPASSWORD"}'
```

`MONGOS_BY_ENV` allows a convenient mapping layer of where to start
introspection from using `--env` flag.

# Usage

```
# Simple form of directly declaring endpoint to connect
msh localhost:27017

# Prompted form
msh --env production
```

<img width="697" alt="image" src="https://github.com/zph/msh/assets/1026584/003599bd-440d-465d-9900-7f884c3feb08">
