const fs = require("fs");
const sessionPath = process.argv[2];
const outPath = process.argv[3];
const session = JSON.parse(fs.readFileSync(sessionPath, "utf8"));
const API = "http://localhost:3000/api";

async function main() {
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const homeRes = await fetch(`${API}/homes`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Card check" }),
  });
  const home = await homeRes.json();
  if (!homeRes.ok) throw new Error("home " + JSON.stringify(home));
  const listsRes = await fetch(`${API}/homes/${home.id}/lists`, { headers });
  const lists = await listsRes.json();
  if (!listsRes.ok) throw new Error("lists " + JSON.stringify(lists));
  const list = Array.isArray(lists) ? lists[0] : null;
  if (!list?.id) throw new Error("no list " + JSON.stringify(lists));
  const itemRes = await fetch(`${API}/homes/${home.id}/items`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "dsadas",
      quantity: 1,
      category: "supermarket",
      urgent: true,
      listId: list.id,
    }),
  });
  const item = await itemRes.json();
  if (!itemRes.ok) throw new Error("item " + JSON.stringify(item));
  fs.writeFileSync(
    outPath,
    JSON.stringify({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user,
    }),
  );
  console.log(JSON.stringify({ homeId: home.id, listId: list.id, itemId: item.id }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
