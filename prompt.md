The following API call is not displaying the invoice data for the agent, even though the agent should be able to view their own invoices:

Request URL:
https://api.sentracoresystems.com/api/invoices?page=1&limit=20

Request Method:
GET

Status Code:
304 Not Modified

Issue:

When the agent makes the request to retrieve their invoices, they are not seeing any data. The system is returning a 304 Not Modified status, which typically indicates no new content or changes have been detected.
However, the agent should be able to see their own invoices, even if they haven't been modified recently.

Required Fix:

Check the API response: Verify if the correct data (agent's invoices) is being returned by the API, especially in cases where there have been no modifications.
Fix the caching mechanism: Ensure that the 304 Not Modified response is not being returned incorrectly. The agent should still be able to view their invoices, regardless of whether they have changed.
Verify role-based filtering: Ensure that the API is filtering invoices based on the agent’s role, so that the agent can only see their own invoices.
Check query parameters: Ensure that the page=1&limit=20 parameters are properly handled to return the appropriate results, especially if there are invoices for the agent that are not being shown.