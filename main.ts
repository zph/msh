#!/usr/bin/env -S deno run --allow-all --unstable

import "https://deno.land/std/log/mod.ts";
import { Select } from "https://deno.land/x/cliffy@v0.25.7/prompt/select.ts";
import "https://deno.land/x/lodash@4.17.19/dist/lodash.js";
import * as log from "https://deno.land/std@0.217.0/log/mod.ts";
import config from "./config.json" with { type: "json" };
import $ from "https://deno.land/x/dax/mod.ts";

// now `_` is imported in the global variable, which in deno is `self`
// deno-lint-ignore no-explicit-any
const _ = (self as any)._;
import {
  blue,
  bold,
  dim,
  gray,
  green,
  red,
} from "https://deno.land/std/fmt/colors.ts";
import { parse } from "https://deno.land/std/flags/mod.ts";

const PARSED_ARGS = parse(Deno.args, {
  boolean: ["version", "debug"],
  string: ["env"],
  default: { env: "local", "debug": false },
});

let logDefault: log.LoggerConfig = { level: "INFO", handlers: ["jsonStdout"] };

if (PARSED_ARGS.debug) {
  logDefault = { level: "DEBUG", handlers: ["jsonStdout"] };
}

await log.setup({
  //define handlers
  handlers: {
    jsonStdout: new log.ConsoleHandler("DEBUG", {
      formatter: log.formatters.jsonFormatter,
      useColors: false,
    }),
  },
  //assign handlers to loggers
  loggers: {
    default: logDefault,
  },
});
const logger = log.getLogger();

import { MongoClient } from "npm:mongodb@5.6";

if (Deno.env.has("MSH_ENV_VAR_OVERRIDE")) {
  const overrides = JSON.parse(Deno.env.get("MSH_ENV_VAR_OVERRIDE") || "{}");
  const uOverride = overrides["MONGO_USER"];
  const pOverride = overrides["MONGO_PASSWORD"];
  if (uOverride) {
    Deno.env.set("MONGO_USER", Deno.env.get(uOverride) || "");
  }
  if (pOverride) {
    Deno.env.set("MONGO_PASSWORD", Deno.env.get(pOverride) || "");
  }
}

const MONGO_USER = Deno.env.get("MONGO_USER") || "";
const MONGO_PASSWORD = Deno.env.get("MONGO_PASSWORD") || "";
const MONGO_AUTH_DB = Deno.env.get("MONGO_AUTH_DB") || "admin";

const buildAuthURI = (user: string, password: string) => {
  if (user === "") return "";
  return [
    user,
    ":",
    password,
    "@",
  ].join("");
};

/*
mongos> db.getSiblingDB('config').mongos.find({}, {_id: 1})
{ "_id" : "enterprise.gear.xargs.io:27017" }

mongos> db.getSiblingDB('config').shards.find({}, {host: 1})
{ "_id" : "shard01", "host" : "shard01/localhost:27018,localhost:27019,localhost:27020" }
{ "_id" : "shard02", "host" : "shard02/localhost:27021,localhost:27022,localhost:27023" }
{ "_id" : "shard03", "host" : "shard03/localhost:27024,localhost:27025,localhost:27026" }

mongos> db.adminCommand("getShardMap").map

ping each mongo shard for membership
db.getSiblingDB("admin").runCommand({replSetGetStatus: 1}).members
*/

const getMongosByEnv = (envName: string) => {
  if (!Deno.env.has("MONGOS_BY_ENV")) {
    throw new Error("Missing MONGOS_BY_ENV variable which is json encoded");
  }

  const MONGOS_BY_ENV = JSON.parse(Deno.env.get("MONGOS_BY_ENV") || "{}");
  return MONGOS_BY_ENV[envName];
};
const getShardMap = async (envName: string) => {
  const uri = `mongodb://${buildAuthURI(MONGO_USER, MONGO_PASSWORD)}${
    getMongosByEnv(envName)
  }?authSource=${MONGO_AUTH_DB}`;
  logger.debug("getShardMap", { fn: "getShardMap", uri });

  let result
  try {
    const client = new MongoClient(uri);
    result = await client.db("admin").command({ getShardMap: 1 });
  } catch (error) {
      logger.warn(`Error on ${envName}`, {error, MONGO_USER, MONGO_AUTH_DB})
  }
  return result?.map;
};

const mongosh = async (args: string[]) => {
  const cmd = new Deno.Command("mongo", { args: args });
  logger.debug("mongosh", { cmd, args });
  const child = cmd.spawn();
  await child.status;
};

const mainPrompted = async (envName: string) => {
  const shardMap: Record<string, string> = await getShardMap(envName);

  // Refactor this to be by shard value
  let nodes = Object.entries(shardMap).filter(([k, v]) => {
    return k !== v;
  }).filter(([k, v]) => {
    // Nodes lack a /
    if (k.indexOf("/") === -1 && k.indexOf(":") !== -1) {
      return true;
    }

    if (v.startsWith(k)) {
      return false;
    }

    return false;
  });

  type Shard = {
    rs: string;
    connection: string;
  };

  const allShards = nodes.map(([k, v]) => {
    // "rs-N/rs1-0:27017,rs1-1:27017,rs1-2:27017"
    const [rs, connection] = v.split("/")
    return {rs, connection} as Shard
  })

  const shardURIs = _.uniqBy(allShards, (s: Shard) => (s.rs))

  type Node = {
    rs: string;
    name: string;
    state: string;
  };

  const nodeRespondedOnPort = async (node, port) => {
    const result = await $`nc -z ${node} ${port}`.stdout("piped").noThrow().quiet()
    if(result.code === 0) {
      return true
    }
    return false
  }
  // Fails if any of the nodes is unreachable on the port
  // So we work around that by trying one node at a time
  // first with netcat and then with the actual connection
  // See issue: https://github.com/denoland/deno/issues/11595
  const replSetGetStatus = async ({rs, connection}: Shard) => {
    const oneNode = await connection.split(",").find(async (c) => {
      const [node, port] = c.split(":")
      return await nodeRespondedOnPort(node, port)
    })
    // NOTE: ?authenticationDatabase=admin is equivalent to authSource when using driver :shrug:
    const uri = `mongodb://${
      buildAuthURI(MONGO_USER, MONGO_PASSWORD)
    }${oneNode}/?authSource=${MONGO_AUTH_DB}&directConnection=true&replicaSet=${rs}`;
    logger.debug("mainPrompt looping over nodes", { uri });
    try {
      const client = new MongoClient(uri);
      logger.debug("mainPrompt client instantiated", { uri });
      const db = client.db("admin")
      logger.debug("mainPrompt db instance");
      return await db.command({ replSetGetStatus: 1 })
    } catch (error) {
      logger.error(error)
    }
  }
  const allNodes: Node[] = [];
  for await (const n of shardURIs) {
    const result = await replSetGetStatus(n).catch(e =>
      logger.error("Error getting connection", e)
      )
    // Try to guard against a single node going down and breaking connectivity
    if(result === undefined) {
      continue
    }
    // deno-lint-ignore no-explicit-any
    const all = result.members.map((e: any) => {
      return {rs: n.rs, name: e.name as string, state: e.stateStr };
    });
    allNodes.push(all);
  }

  // Insert mongos back into the total possible set
  allNodes.push(
    { rs: "mongos", name: getMongosByEnv(envName), state: "none" } as Node,
  );

  const colorByState = (state: string) => {
    switch (state) {
      case "PRIMARY":
        return bold(red(state));
      case "SECONDARY":
        return bold(green(state));
      default:
        return bold(gray(state));
    }
  };

  const uniqNodes = _.chain(allNodes).flatten().uniqBy("name").map(
    (e: Node) => {
      return {
        name: `${blue(e.name)} in shard: ${dim(blue(e.rs))} with state: ${
          colorByState(e.state)
        }`,
        value: e.name,
      };
    },
  ).value();

  const server: string = await Select.prompt({
    message: "Pick server to connect to",
    info: true,
    options: uniqNodes,
    search: true,
  });

  return server;
};

const connect = async () => {
  let server = PARSED_ARGS._[0];
  if (PARSED_ARGS["env"]) {
    server = await mainPrompted(PARSED_ARGS.env);
  }

  Deno.addSignalListener("SIGINT", () => {
    console.log("interrupted!");
    Deno.exit();
  });

  if (MONGO_USER !== "") {
    // TODO: unhardcode this best practice for auth database :shrug: but it breaks the unescaping
    await mongosh([
      `mongodb://${server}`,
      `--username`,
      MONGO_USER,
      `--password`,
      MONGO_PASSWORD,
      `--authenticationDatabase`,
      MONGO_AUTH_DB,
    ]);
  } else {
    await mongosh([
      `mongodb://${server}`,
    ]);
  }
};

const version = () => {
  console.info(`msh version ${config.version}`);
};

const main = () => {
  if (PARSED_ARGS.version) {
    version();
  } else {
    connect();
  }
};

await main();
