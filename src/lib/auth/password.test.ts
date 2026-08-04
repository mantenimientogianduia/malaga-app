import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("verifies a correct password against its hash", async () => {
    const hash = await hashPassword("correcto-horse-battery");
    expect(await verifyPassword("correcto-horse-battery", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correcto-horse-battery");
    expect(await verifyPassword("otra-cosa", hash)).toBe(false);
  });

  it("nunca guarda el password en texto plano dentro del hash", async () => {
    const hash = await hashPassword("mi-password-secreto");
    expect(hash).not.toContain("mi-password-secreto");
  });
});
