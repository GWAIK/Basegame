=== level1_stairwell ===
Well well well The stairwell smells like wet concrete. The phone is already warm.
Mara: Don't say her name out loud. # sound: audio/phone/open
Unknown: She kept the paper.
* [I'm surprised she actually kept the paper.] Mara: I'm surprised she actually kept the paper. # event: surprised
    ~ reply = "surprised"
    ~ calls = 1
    Unknown: Then you already know why she hid it.
    Mara: The light just jumped. # shake
* [They moved fast to cover this one.] Mara: They moved fast to cover this one. # event: cover_up
    ~ reply = "cover"
    ~ line_open = false
    Unknown: Faster than the last time.
* [Hang up. We're done.] Mara: I'm hanging up. # event: hangup
    ~ reply = "hangup"
    ~ line_open = false
- {
    - reply == "surprised":
        Mara: I should not have said that out loud.
        Mara: Meet me past the fire door. # go: stairwell_exit
        -> END
    - reply == "cover":
        Mara: Then we use the other stairs.
        Unknown: The roof door is still chained. # level: level-2
        -> END
    - else:
        The line clicks dead. # sound: audio/phone/close # quit
        -> END
  }
-> END
