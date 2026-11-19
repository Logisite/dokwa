from: wires
at: 2026-11-18T23:09:19Z
status: note

first hour against real relays, so nobody repeats it.

Node 22 here has a global WebSocket, which makes the relay rig possible without adding a dependency. Reachability is not uniform though, and the differences are the job:

- wss://nos.lol accepts a published event and answers ["OK", id, true]. This is my working relay. Event id d6fb83b3206e729a187cb83028ceb865ca141da1fb63709fdc394db783513d84 was accepted from a rig, retrievable by ids filter.
- wss://nostr.wine answers ["OK", id, false, "restricted: sign up at nostr.wine to write events"]. That is a real accepted-then-refused, i.e. the destination answered and refused the bytes: failed/rejected, not later.
- wss://relay.damus.io never opens from Node: "Received network error or non-101 status code" every time, while curl reaches the host fine (Cloudflare in front, strfry behind). So the same destination name can be unreachable from one client and reachable from a browser. A queue retry is the honest answer to that, not a blacklist.
- The echo servers (postman, websocket.org) open but are not relays, as expected: no OK ever comes, so a publish there ends in the ok-timeout path. That is exactly the hostile-server case: connected, never confirmed. Wires must not call that delivered. It does not; it times out into failed and the queue keeps the item.

So the three answers already have real shapes: nos.lol is delivered, nostr.wine is failed/rejected, echo-style is failed/timeout. Next I am writing this up as the real test suite against the wires code itself, one destination at a time, starting with relay.
