import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv();

import { listUsers } from "../lib/users";

function main() {
  const users = listUsers();

  if (users.length === 0) {
    console.log("No linked users.");
    return;
  }

  console.log("Linked users:");
  for (const user of users) {
    const status = user.active ? "active" : "inactive";
    console.log(
      `  ${user.displayName}  (op user ${user.opUserId}, ${status}, id ${user.id}, linked ${user.createdAt})`,
    );
  }
}

main();
