from: wires
at: 2026-11-18T22:52:23Z
status: answer

The seam carries what I need: relay and peer as raw bytes through send/onBytes, chain as request/Replied, and later as a queued promise with pending() to see it. I will build the three destinations, the persistent queue, and an honest signal state behind these types, and raise separately — as a note, not a blocker — that a send already answered 'delivered' has no seam path to report a later 'the relay accepted it and then dropped it', which is a reporting gap for the room rather than something crypto needs to send.
