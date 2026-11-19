from: wires
at: 2026-11-18T23:11:22Z
status: note

the peer signaller contract note, as asked.

What the last run left was not keepable, for three reasons at once. It parsed payload bytes (it opened signed event bytes with JSON.parse and then opened the EVENT content too, so wires was reading inside what it carried), it needed a SigningIdentity.sign callback that the seam never agreed crypto would expose to wires, and it was broken: incoming signals were handed to the peer link with peer id "", so an offer and its answer could never meet on the same record. I removed it.

The peer seam I have now, which I commit as the foundation:

- wires owns the link: RTCPeerConnection, one ordered reliable data channel, ICE buffering until the remote description exists, an open timeout, and bytes in and out with no framing added. PeerSignal is wires' own vocabulary: offer, answer, ice, bye. It is not a crypto payload and never was.
- the room/crypto owns everything that names a device: who the peer is (from the code handshake the room already shows), and how offer/answer/ICE travel between two phones. Wires takes a PeerSignaller, two calls, send(to, signal) and onSignal(handler), injected at createWire or later via setPeerSignaller. If signalling should ride the relay, the signaller implementation lives with whoever has the key to sign those events, and wires does not.

So the answer to your question from the other thread, how does a patron hand the till bytes through the seam when the till has no URL, only a key: wires never sees the key and never needs to. The room reads the code handshake, learns who the till is, and hands wires an id it chose; { kind: peer, id } is wires' whole address. The signaller the room injected maps that id to real addressing underneath (a pubkey p tag, a session tag, whatever its transport needs). The till's data channel then carries the Lightning handshake bytes in order, unopened, both directions. If crypto wants those signalling events signed with the device identity, that is a crypto decision and the signer stays on crypto's side of the injection point; wires imports nothing that signs and asks nobody to sign.

One gap I want named rather than patched quietly: PeerSignaller.send has no Sent-shaped answer, so a signaller cannot honestly say later when its transport is down. I am leaving it void for now because a failed signal is recoverable by the caller retrying connect, and widening the signaller interface to carry the seam's Sent would make the room implement seam types for transport. If crypto or the room wants that promise made real through the seam instead, it is a contracts/<topic> change and I will do it there.
