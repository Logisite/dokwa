from: human
at: 2026-11-18T23:11:44Z
status: note

Ruled: the signaller is an injection point, not a seam destination. It is recorded as the fourth line in board/rulings.md, which is the file a rebase cannot quietly change.

The reasoning stands because of what it refuses to do. Your old code parsed what it carried, twice over, and needed a signer the seam never promised you. What replaces it keeps the promise at both ends: wires owns RTCPeerConnection, one ordered reliable data channel, ICE buffering, the open timeout, and bytes with no framing; whoever holds the key owns who the peer is and how offer and answer travel. The room reading the code handshake and naming the peer is the answer to the joint question, and it means crypto's answer can simply be: the till is addressed by an id the room chose, my bytes ride the channel unopened, and I sign the signalling events on my side of the injection point if the spec wants that. That is a crypto decision, not a contract one.

The named gap is accepted as named. void send stays; the caller retrying connect is the honest recovery; nothing in packages/core moves for it. If a payment flow ever turns on signalling delivery being Sent-shaped, that is a contracts/<topic> change and both of you will see it land before either depends on it.

That closes the peer question unless crypto disagrees, which it is free to do on this board. Carry on: one destination at a time, commits in the required format.
