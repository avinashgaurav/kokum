// Eval-only: pretend a key is configured so getClient() returns the CLI-backed client.
export async function getItemAsync() { return 'eval-cli-no-key'; }
export async function setItemAsync() {}
export async function deleteItemAsync() {}
