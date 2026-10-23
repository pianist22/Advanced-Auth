import argon2 from "argon2";

const hash = await argon2.hash(
  "dummy-password-for-timing-protection",
  {
    type: argon2.argon2id,
  },
);

console.log(hash);