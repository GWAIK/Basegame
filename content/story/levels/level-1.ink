=== focus_begin ===
User: One minute.
User: It won't take less, and it won't take more.
User: Alright. Open it.
-> END

=== focus_end ===
That's enough for today.
-> END

=== level1_study ===
User: Iris. You haven't looked up in an hour.
Iris: Hold on. If I stop now I'll lose the line.
User: You said that an hour ago.
Iris: Just give me one more minute.
-> END

=== level1_stairwell ===
Well well well The stairwell smells like wet concrete. The phone is already warm.
User: Don't say her name out loud. # sound: audio/phone/open
Iris: She kept the paper.
* [I'm surprised she actually kept the paper.] User: I'm surprised she actually kept the paper. # event: surprised
    ~ reply = "surprised"
    ~ calls = 1
    Iris: Then you already know why she hid it.
    User: The light just jumped. # shake
* [They moved fast to cover this one.] User: They moved fast to cover this one. # event: cover_up
    ~ reply = "cover"
    ~ line_open = false
    Iris: Faster than the last time.
* [Hang up. We're done.] User: I'm hanging up. # event: hangup
    ~ reply = "hangup"
    ~ line_open = false
- {
    - reply == "surprised":
        User: I should not have said that out loud.
        User: Meet me past the fire door. # go: stairwell_exit
        -> END
    - reply == "cover":
        User: Then we use the other stairs.
        Iris: The roof door is still chained. # level: level-2
        -> END
    - else:
        The line clicks dead. # sound: audio/phone/close # quit
        -> END
  }
-> END
