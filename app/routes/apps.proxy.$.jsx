import { authenticate } from "../shopify.server";

// Loader for GET requests
export const loader = async ({ request }) => {
  return new Response(JSON.stringify({ message: "Use POST method" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

// Handler for creating customer account
async function handleCreateAccount(request, admin) {
  const formData = await request.formData();
  const email = formData.get("email");
  const styleDNA = formData.get("style");

  if (!email || !styleDNA) {
    return new Response(JSON.stringify({
      success: false,
      error: "Email and style are required"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Step 1: Check if customer already exists
  const searchRes = await admin.graphql(
    `query FindCustomer($query: String!) {
      customers(first: 1, query: $query) {
        edges { node { id } }
      }
    }`,
    { variables: { query: `email:${email}` } }
  );
  const searchResult = await searchRes.json();
  const existingId = searchResult?.data?.customers?.edges?.[0]?.node?.id;

  if (existingId) {
    // Step 2a: Update existing customer's style DNA
    const setRes = await admin.graphql(
      `mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id value }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [{
            ownerId: existingId,
            namespace: "custom",
            key: "style_dna",
            type: "single_line_text_field",
            value: styleDNA,
          }],
        },
      }
    );
    const setResult = await setRes.json();
    const setErrors = setResult?.data?.metafieldsSet?.userErrors ?? [];

    if (setErrors.length > 0) {
      return new Response(JSON.stringify({
        success: false,
        error: setErrors[0]?.message || "Failed to update style"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      existing: true,
      message: "Your Style DNA has been updated"
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  // Step 2b: Create new customer
  const createRes = await admin.graphql(
    `mutation CreateCustomer($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer { id }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        input: {
          email,
          metafields: [{
            namespace: "custom",
            key: "style_dna",
            type: "single_line_text_field",
            value: styleDNA,
          }],
        },
      },
    }
  );
  const createResult = await createRes.json();
  const createErrors = createResult?.data?.customerCreate?.userErrors ?? [];

  if (createErrors.length > 0) {
    return new Response(JSON.stringify({
      success: false,
      error: createErrors[0]?.message || "Failed to create account"
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const customerId = createResult.data?.customerCreate?.customer?.id;

  // Step 3: Send account invite email
  if (customerId) {
    await admin.graphql(
      `mutation SendInvite($customerId: ID!) {
        customerSendAccountInviteEmail(customerId: $customerId) {
          customer { id }
          userErrors { field message }
        }
      }`,
      { variables: { customerId } }
    );
  }

  return new Response(JSON.stringify({
    success: true,
    existing: false,
    message: "Account created! Check your email to set your password."
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

// Main action
export const action = async ({ request, params }) => {
  try {
    const { admin, session } = await authenticate.public.appProxy(request);

    if (!admin || !session) {
      console.error("No offline session found for shop. App may need to be reinstalled.");
      return new Response(JSON.stringify({
        success: false,
        error: "App is not installed on this store. Please install the app first."
      }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    const path = params["*"];

    if (path?.includes('create-account')) {
      return await handleCreateAccount(request, admin);
    }

    return new Response(JSON.stringify({ error: "Unknown route" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("App proxy error:", e);
    return new Response(JSON.stringify({
      success: false,
      error: "Something went wrong. Please try again."
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};