We need to enhance the Discussion tab inside the Leads module and Lead Detail sheet by making it more advanced and integrating the existing editor + mention + notification system.

Context
Currently, the Discussion tab is very basic/simple
Previously, while building the notification system:
we implemented user mentions (@mention)
and a rich text editor component with formatting + mention support
That component already exists but is not integrated here yet
Objective

Upgrade the Discussion tab to a more advanced communication system with:

rich text editor
user mentions
notification on mention
Requirements
1. Integrate Rich Text Editor
Replace the current simple input with the existing editor component
Support:
text formatting (bold, italic, etc.)
mentions (@user)
Keep UI clean and consistent with system design
2. Mention Functionality
When user types @, show user suggestions
Allow selecting users from list
Insert mention properly in content
Support multiple mentions in a single message
3. Notification on Mention

When a user is mentioned:

send a notification to that specific user
notification message format:

“{actorName} mentioned you on this lead”

include:
lead reference (id or title)
link to open that lead/discussion
4. Discussion UI Improvement
Improve overall discussion experience:
better message layout
timestamps
user info (name/avatar)
proper spacing and readability
Make it feel like a modern activity/discussion feed
5. Reuse Existing Logic
Reuse already built:
mention logic
notification system
editor component
Do not rebuild from scratch
Implementation Notes
Keep it reusable for future modules (e.g., deals, clients, etc.)
Ensure no performance issues with mentions
Handle edge cases:
duplicate mentions
self-mention (optional behavior)
deleted users (if applicable)
Deliverables
1. Integration Summary
Where editor is integrated
How mentions are handled
2. Notification Flow
How mention triggers notification
Which service/function is used
3. Final Result
Clean, advanced discussion tab with:
rich editor
mentions
notifications
Important
Do not break existing discussion data
Keep backward compatibility
Do not change unrelated logic
Short Version

Enhance Discussion tab in Leads module:

integrate existing rich text editor (with formatting + @mentions)
enable user mentions with dropdown
send notification on mention: “{user} mentioned you on this lead”
improve discussion UI (layout, spacing, user info, timestamps)
reuse existing editor + notification system
keep implementation reusable and do not break existing logic