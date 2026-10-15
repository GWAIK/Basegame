// Dialogues live in this story. A knot name is what a level calls: { "dialogue": "paper" }.
// Tags on a line tell the game what to do:
//   # sound: shared/audio/whisper.wav
//   # shake
//   # event: surprised
//   # go: hana
//   # level: level-1
//   # quit
// A fact set with ~ stays true for the rest of the game, so a later knot can ask about it.
// A choice is a line starting with *. The text in brackets is the reply on screen.
// # event: name fires when that reply is chosen. The game listens for the name.

VAR lucy_reply = ""

=== intro ===
Lucy: I should probably finish this before midnight.
Unknown: Are you still there? # sound: shared/audio/whisper.wav
Lucy: ...Yeah.
-> END

=== paper ===
Unknown: She kept the paper.
* [I'm surprised she actually kept the paper.] Lucy: I'm surprised she actually kept the paper. # event: surprised
    ~ lucy_reply = "surprised"
    Unknown: Then you already know why she hid it.
* [They moved fast to cover this one.] Lucy: They moved fast to cover this one. # event: cover_up
    ~ lucy_reply = "cover"
    Unknown: Faster than the last time. Don't write that down.
* [She won't have peace for a while.] Lucy: She won't have peace for a while. # event: no_peace
    ~ lucy_reply = "peace"
    Unknown: Neither will you, if you stay on this call.
- { lucy_reply == "surprised":
    Lucy: I should not have said that out loud.
  - else:
    Lucy: I need to hang up.
  }
-> END
