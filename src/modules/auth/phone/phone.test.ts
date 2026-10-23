import { describe, expect, it } from "vitest";

import { normalizePhoneNumber } from "../../../utils/phone.js";

describe("Phone utilities", () => {
  it("should normalize an Indian phone number", () => {
    const result = normalizePhoneNumber(
      "98765 43210",
      "IN",
    );

    expect(result).toBe("+919876543210");
  });

  it("should normalize an E.164 phone number", () => {
    const result = normalizePhoneNumber(
      "+919876543210",
      "IN",
    );

    expect(result).toBe("+919876543210");
  });

  it("should reject an invalid phone number", () => {
    expect(() =>
      normalizePhoneNumber(
        "12345",
        "IN",
      ),
    ).toThrow();
  });
});