import { describe, it, expect } from "vitest";
import { query } from "./db";

describe("db connection", () => {
  it("connects and runs a query against the malaga schema", async () => {
    const result = await query<{ schema: string }>("SELECT current_schema() AS schema");
    expect(result.rows[0].schema).toBe("malaga");
  });
});
