import { ROLES as R, TENANT_TYPES as T } from "@mep/schemas";
import { expect, test } from "vitest";
import { ROLES, TENANT_TYPES } from "../src/schema";

test("enums in db blijven gelijk aan @mep/schemas", () => {
  expect([...ROLES]).toEqual([...R]);
  expect([...TENANT_TYPES]).toEqual([...T]);
});
