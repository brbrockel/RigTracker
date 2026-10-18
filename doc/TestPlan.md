# Test Plan

A hands-on checklist for reviewing RigTracker 2.0.0 on a **phone** and on a **desktop browser** before the release. Work through each section on both. Tick items off, and write down anything that fails or feels wrong, with the device, the screen and what you expected.

Site: https://rigtracker.bhbslp.org

Everything here works on real club data, so use a **"Test"** rig, gear item, event and person for anything you add, change or delete, and remove them in section 12.

## 0. Setup

- [ ] **Three browsers** let you be three people at once:
  - your normal browser: **you** (Admin)
  - a private window: a **"Test" person** you add on People, with sign-in access as **User**
  - another device or browser: a **guest** (no sign-in)
- [ ] **Phone:** add RigTracker to the home screen. In Safari: Share → Add to Home Screen (the app shows a hint the first time). On Android: menu → Install app. Open it from the icon, and check it opens full screen with the RigTracker icon.

## 1. Sign-in and passwords

- [ ] **People → ⋯ → Sign-in access…** on the Test person: give access as **User**, then **Get password link**. **Copy link** and open it in a private window. It shows their email. Try a short password and a common one (e.g. "password123"): both refused. Set a real one: you're signed in.
- [ ] Open the same link again: "This link doesn't work".
- [ ] **Text it (phone):** **Get password link** on a person with a mobile number opens Messages addressed to them with the link filled in. Check on an iPhone and an Android phone if you can. Don't press send unless it's for you.
- [ ] Sign out, then sign in with email and password.
- [ ] Wrong password 5 times: it says to try again later. As Admin, People shows **Locked**; **⋯ → Unlock account**, then sign in works. **Activity log → Lockouts** shows it.
- [ ] **Account → Security:** change your password (it asks for the current one). Your other browser is signed out.
- [ ] **Authenticator (optional):** set it up, scan the QR code, enter a code and save the recovery codes. Sign out and in: it asks for a code. A recovery code works once. As Admin, **⋯ → Reset authenticator** for the Test person.
- [ ] **⋯ → Sign out everywhere** on the Test person signs out their other browser.
- [ ] **Needs a password:** while anyone with sign-in access has no password, Admins get a red to-do banner naming them, with no ✕. It opens People filtered to **Needs a password**, where each has a badge (or **Needs an email and a password**). It goes away once each has set one, or their access is off.
- [ ] Pasting a password link into the address bar while already on the sign-in page opens the set-password form.

## 2. Guests

- [ ] On the sign-in page, **Look around as a guest**.
- [ ] Guests see Rigs, Gear and Events with photos, read-only: no Add, Edit, Delete, Select or Quick add.
- [ ] People show as first name and last initial only. There are no emails, phones, addresses, dates of birth or emergency contacts anywhere, and no People tab, Activity log or notices for members.
- [ ] A public notice (section 9) does show for guests.
- [ ] Opening a person's or an admin page's address directly doesn't show private details.

## 3. Navigation and look

- [ ] **Phone:** bottom tabs are Home, Rigs, Gear, Events and People. The horn and the account menu are top right.
- [ ] **Desktop:** the same items are across the top.
- [ ] **Account menu:** Account, Activity log (Admin) and Sign out.
- [ ] **Account → Appearance:** Device, Light and Dark work and are remembered.
- [ ] Nothing is cut off or needs sideways scrolling at phone width, in light and dark.
- [ ] A made-up address (e.g. `/rigs/nope`) shows "Page not found" with **Go home**.

## 4. Home

- [ ] Totals for Rigs, Gear, People and Events, each linking to its page.
- [ ] **Repacks** lists rigs due soon or overdue, with "Due today" where it applies.
- [ ] **Upcoming events**, or "No events coming up".
- [ ] **Quick add** (User and Admin) opens the add forms. Viewers and guests don't see it.

## 5. Rigs

- [ ] **Layouts:** Table, List, Gallery and Cards. Each is remembered on this device, separately for Rigs and Gear.
- [ ] **Search** by name, number, serial or person; the filter (All rigs, Repack overdue, Due in 30 days, No primary person).
- [ ] **Sort** ascending and descending, **group by**, and the column picker in Table.
- [ ] **Select** several rigs: the bar shows how many, with Export, and Delete for Admins. **Export** downloads a CSV that opens in a spreadsheet. **Print** shows a clean sheet.
- [ ] **Add** a Test rig with a number, a primary person and repack dates. A duplicate rig number is refused.
- [ ] **Rig page:** Details, Notes and the repack badge (overdue, due soon or fine).
- [ ] **Components:** set the container, main, reserve and AAD from **New gear** or **Choose existing gear**. Gear on another rig says it will be moved. Each position holds one item.
- [ ] **Other gear on this rig:** **Assign** gear, then unassign it.
- [ ] **Photos:** add photos and a video from the phone's camera and library, then reorder them (the first is the cover on Gallery and Cards), edit a caption and delete one. Swipe or use the arrows in the viewer.
- [ ] Edit the Test rig, then delete it. Its gear stays, unassigned.

## 6. Gear

- [ ] The same layouts, sort, group, columns, select, CSV and print as Rigs.
- [ ] **Filters:** type (All types), and assignment (Any assignment, On a rig, With a person, Unassigned). **Search** by name, serial or type.
- [ ] **Add** Test gear with a type, serial, date of manufacture and photos. A duplicate serial is refused.
- [ ] **Select** several items: assign them to a rig or a person, unassign them, and (Admin) delete them.
- [ ] Gear on a rig shows that rig's primary person.

## 7. Events

- [ ] **Upcoming** and **Past**, and **Search** by name or description.
- [ ] **Add** a Test event with a date and photos. The event page shows them, and editing works.
- [ ] Delete the Test event.

## 8. People (User and Admin)

- [ ] **Filters:** Everyone, Can sign in, No sign-in and Admins; **Sort by** first or last name; **Search** by name, email or phone.
- [ ] **Add** a Test person with only a first name (the last name is optional).
- [ ] **Person page:** call, text, email and map links; date of birth and address; emergency contacts, or "None on file"; their rigs and gear; **Assign gear**.
- [ ] Imported people with old placeholder dates (before 1950) show them as unset.
- [ ] As **User**: rigs, gear, events and people can be added and edited, but nothing can be deleted, and there's no sign-in access or Activity log.
- [ ] As **Viewer** (change the Test person's access): everything is read-only.

## 9. Notices

- [ ] **Horn → New notice (Admin):** post to **Everyone who signs in**, **One person** and **The public (guests too)**. Each shows only for the people it's for.
- [ ] **Banners:** new notices show as one-line banners under the top bar on every page. With more than one they stack with "+N"; tap to fan them out. Tap one for the full text; **✕** clears it and brings up the next.
- [ ] **How long:** a banner shows for a week (two days for one person), or until the **Banner until** date. **Must see** keeps it until each person clears it. After that it stays in the horn's list.
- [ ] **The horn:** a dot shows unread notices. Opening it leaves them unread; **Mark all read** clears the dot.
- [ ] **Home** shows a one-line strip while something is new.
- [ ] **Also text it (phone):** after posting, the text link opens Messages to everyone it's for with a mobile number, and says how many were skipped.
- [ ] **People → ⋯ → Send notice** opens a new notice for that person.
- [ ] **Repack reminders:** a rig's primary person gets a banner when its repack is due within 14 days or overdue. Admins get one summary (e.g. "3 rigs overdue") that opens Rigs filtered to them.
- [ ] Edit a notice, and delete one. Activity log shows both.

## 10. Activity log (Admin)

- [ ] **Account menu → Activity log:** everything newest first, including your own sign-in. Filter by record type and by action (Added, Changed, Deleted, Signed in, Failed sign-ins, Lockouts, Password links and more), and **Load more**.
- [ ] A change shows what it was before and after.
- [ ] Nothing here can be edited or deleted.

## 11. Installed app

- [ ] Reopen it from the home screen after a deploy: it picks up the new version without reinstalling (it may take one reopen).
- [ ] Signing out and in from the installed app works the same as in the browser.

## 12. Clean-up and safety

- [ ] Delete the Test rig, gear, event and person, and any test notices.
- [ ] Turn off the Test person's sign-in access if you keep them.
- [ ] Nobody received any email or text you didn't send yourself.

## Reporting problems

For each issue, note:
- the device (phone/desktop, browser)
- who you were signed in as
- the screen
- what you did, what you expected and what happened

A screenshot helps.
