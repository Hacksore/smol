#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { SmolStack } from "../lib/smol-stack";

const app = new cdk.App();

const DEFAULT_MEMORY_LIMIT = 8096;
new SmolStack(app, "SmolStack", {
  env: {
    account: "065495811055",
    region: "us-east-1",
  },
  memoryLimit:
    parseInt(process.env.MEMORY_LIMIT || `${DEFAULT_MEMORY_LIMIT}`) ||
    DEFAULT_MEMORY_LIMIT,
});
