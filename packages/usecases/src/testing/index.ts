import { DatabaseTest } from "@cycle/database/testing";
import { Layer } from "effect";
import { UseCaseServicesLive } from "../UseCases.ts";

export const UseCaseTest = (prefix?: string) =>
  Layer.mergeAll(DatabaseTest(prefix), UseCaseServicesLive);
