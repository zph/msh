#!/usr/bin/env -S deno run --allow-all --unstable

import "https://deno.land/x/violet/globals.d.ts";
import "https://deno.land/x/violet@0.1.0/globals.ts";
import "https://deno.land/std/log/mod.ts"
import { Select } from "https://deno.land/x/cliffy@v0.25.7/prompt/select.ts";
import "https://deno.land/x/lodash@4.17.19/dist/lodash.js";

// now `_` is imported in the global variable, which in deno is `self`
const _ = (self as any)._;
import { red, green, gray, blue, bold, dim } from "https://deno.land/std/fmt/colors.ts"
import { parse } from "https://deno.land/std/flags/mod.ts";

const PARSED_ARGS = parse(Deno.args)

//mongodb@5.6
import { MongoClient } from "npm:mongodb@5.6"

let MONGO_USER = ""
if(Deno.env.has("MONGO_USER")) {
  MONGO_USER = Deno.env.get("MONGO_USER") || ""
}

let MONGO_PASSWORD = ""
if(Deno.env.has("MONGO_PASSWORD")) {
  MONGO_PASSWORD = Deno.env.get("MONGO_PASSWORD") || ""
}

let MONGO_AUTH_DB = ""
let mongo_auth_args: string[] = []
if(Deno.env.has("MONGO_AUTH_DB")) {
  MONGO_AUTH_DB = Deno.env.get("MONGO_AUTH_DB") || ""
  mongo_auth_args = ["--authenticationDatabase", MONGO_AUTH_DB]
}

let auth = ""
if(MONGO_USER !== "") {
  auth = MONGO_USER
}

if(MONGO_PASSWORD !== "") {
  auth += ":"
  auth += MONGO_PASSWORD
}

if(auth !== "") {
  auth += "@"
}

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

const getShardMap = async (envName: string) => {
  if(!Deno.env.has("MONGOS_BY_ENV")) {
    throw new Error("Missing MONGOS_BY_ENV variable which is json encoded");
  }

  const MONGOS_BY_ENV = JSON.parse(Deno.env.get("MONGOS_BY_ENV") || "{}")
  const uri = `mongodb://${auth}${MONGOS_BY_ENV[envName]}`;
  const client = new MongoClient(uri);
  const result = await client.db('admin').command({getShardMap: 1})
  return result.map
}

const mainPrompted = async (envName: string) => {
  const shardMap: Record<string, string> = await getShardMap(envName)

  let nodes = Object.entries(shardMap).filter(([k, v]) => {
    return k !== v
  }).filter(([k, v]) => {
    // Nodes lack a /
    if (k.indexOf('/') === -1 && k.indexOf(':') !== -1) {
      return true
    }

    if (v.startsWith(k)) {
      return false
    }

    return false
  })

  nodes = _.uniqBy(nodes, 1)

  type Node = {
    rs: string, name: string, state: string
  }

  const allNodes: Node[] = []
  for await (const n of nodes) {
    const [k, _v] = n
    // TODO: ?authenticationDatabase=admin
    const uri = `mongodb://${auth}${k}`;
    const client = new MongoClient(uri);
    const result = await client.db('admin').command({ replSetGetStatus: 1 })
    const all = result.members.map((e: any) => {
      return { rs: result.set, name: e.name as string, state: e.stateStr }
    })
    allNodes.push(all)
  }

  const colorByState = (state: string) => {
    switch (state) {
      case "PRIMARY":
        return bold(red(state))
      case "SECONDARY":
        return bold(green(state))
      default:
        return bold(gray(state))
    }
  }

  const uniqNodes = _.chain(allNodes).flatten().uniqBy('name').map((e: Node) => {
    return { name: `${blue(e.name)} in shard: ${dim(blue(e.rs))} with state: ${colorByState(e.state)}`, value: e.name }
  }).value()

  const server: string = await Select.prompt({
    message: "Pick server to connect to",
    info: true,
    options: uniqNodes,
    search: true,
  });

  return server
}

const main = async () => {
  let server = PARSED_ARGS._[0]
  if(PARSED_ARGS["env"]) {
    server = await mainPrompted(PARSED_ARGS.env)
  }

  if (MONGO_USER !== "") {
    await $`mongo mongodb://${server} --username $MONGO_USER --password$MONGO_PASSWORD ${mongo_auth_args}`
  } else {
    await $`mongo mongodb://${server}`
  }
}

await main()
