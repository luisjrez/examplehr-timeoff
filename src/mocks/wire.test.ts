import { describe, expect, it } from "vitest";

import {
  httpStatusOf,
  parseChaosHeader,
  parseFileRequestBody,
  parseDecisionBody,
} from "./wire";

describe("wire — chaos header parsing", () => {
  it("parses store-level chaos modes", () => {
    expect(parseChaosHeader("silent-failure")).toEqual({
      mode: "silent-failure",
    });
    expect(parseChaosHeader("wrong-success")).toEqual({
      mode: "wrong-success",
    });
    expect(parseChaosHeader("conflict")).toEqual({ mode: "conflict" });
  });

  it("parses transport-level chaos (latency, hard error)", () => {
    expect(parseChaosHeader("latency:1500")).toEqual({ latencyMs: 1500 });
    expect(parseChaosHeader("error")).toEqual({ hardError: true });
  });

  it("ignores absent or malformed values instead of failing the request", () => {
    expect(parseChaosHeader(null)).toEqual({});
    expect(parseChaosHeader("latency:abc")).toEqual({});
    expect(parseChaosHeader("nonsense")).toEqual({});
  });
});

describe("wire — error code → HTTP status mapping", () => {
  it("maps each HcmErrorCode to its status", () => {
    expect(httpStatusOf("version_conflict")).toBe(409);
    expect(httpStatusOf("insufficient_balance")).toBe(422);
    expect(httpStatusOf("invalid_dimensions")).toBe(422);
    expect(httpStatusOf("not_found")).toBe(404);
    expect(httpStatusOf("not_pending")).toBe(409);
  });
});

describe("wire — body validation (unknown in, typed out)", () => {
  it("accepts a well-formed file-request body", () => {
    expect(
      parseFileRequestBody({
        employeeId: "emp-alice",
        locationId: "loc-mx",
        days: 2,
        expectedVersion: 1,
      }),
    ).toEqual({
      employeeId: "emp-alice",
      locationId: "loc-mx",
      days: 2,
      expectedVersion: 1,
    });
  });

  it("rejects missing fields, wrong types and non-integer days", () => {
    expect(parseFileRequestBody(null)).toBeUndefined();
    expect(parseFileRequestBody({ employeeId: "e" })).toBeUndefined();
    expect(
      parseFileRequestBody({
        employeeId: "e",
        locationId: "l",
        days: "2",
        expectedVersion: 1,
      }),
    ).toBeUndefined();
    expect(
      parseFileRequestBody({
        employeeId: "e",
        locationId: "l",
        days: 1.5,
        expectedVersion: 1,
      }),
    ).toBeUndefined();
  });

  it("accepts only approve/deny decisions with an expected cell version", () => {
    expect(
      parseDecisionBody({ decision: "approve", expectedCellVersion: 4 }),
    ).toEqual({ decision: "approve", expectedCellVersion: 4 });
    expect(
      parseDecisionBody({ decision: "deny", expectedCellVersion: 0 }),
    ).toEqual({ decision: "deny", expectedCellVersion: 0 });
    expect(parseDecisionBody({ decision: "maybe" })).toBeUndefined();
  });
});
