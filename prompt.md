Fix the role-based visibility issue for action buttons on **Lead Detail**.

### Problem

On **Lead Detail**, action buttons such as **New Sale** (and related sale/action buttons) are visible for **Admin** and **Manager**, but they are **not visible for Frontsell Agents**.

This needs to be investigated and fixed.

### Current Issue

* **Admin** can see the button(s)
* **Manager** can see the button(s)
* **Frontsell Agent** cannot see the same button(s)

Because of this, Frontsell Agents are unable to access the expected sales flow from Lead Detail.

### Expected Behavior

* If Frontsell Agents are supposed to have permission for this action, then the same button(s) should also be visible to them on **Lead Detail**.
* Button visibility should be aligned with actual permissions and allowed actions.
* UI role checks and backend permission logic should remain consistent.
* A role should not be blocked at UI level if that role is allowed to perform the action.

### What to Check

* frontend role-based conditional rendering on Lead Detail
* permission constants / role mapping for Frontsell Agent
* whether visibility is based on wrong role name or missing role case
* whether the button is hidden by UI only, even though API/action is allowed
* whether Lead Detail action permissions differ incorrectly from other modules/pages

### Fix Requirement

Make sure **Frontsell Agents** can see the relevant Lead Detail action button(s), including **New Sale**, wherever their role is supposed to have access, and keep the UI + permission behavior consistent across the module.
