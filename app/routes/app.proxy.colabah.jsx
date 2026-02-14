import { authenticate } from "../shopify.server";

// Handler for saving style DNA to existing customer
async function handleStyleDNA(request, admin, session) {
  const formData = await request.formData();
  const styleDNA = formData.get("style");
  
  if (!styleDNA) {
    return new Response(JSON.stringify({ error: "Missing style" }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // If customer is not logged in, return success (they'll use localStorage)
  if (!session?.customer?.id) {
    console.log("ℹ️ Guest user - Style DNA saved to localStorage only");
    return new Response(JSON.stringify({ 
      success: true, 
      guest: true,
      message: "Style saved locally" 
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  console.log("✅ Saving Style DNA for customer:", session.customer.id, "Style:", styleDNA);

  const customerId = `gid://shopify/Customer/${session.customer.id}`;

  const mutation = `
    mutation SetCustomerStyleDNA($input: CustomerInput!) {
      customerUpdate(input: $input) {
        customer {
          id
          metafield(namespace: "custom", key: "style_dna") {
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const gqlRes = await admin.graphql(mutation, {
    variables: {
      input: {
        id: customerId,
        metafields: [{
          namespace: "custom",
          key: "style_dna",
          type: "single_line_text_field",
          value: styleDNA,
        }],
      },
    },
  });

  const result = await gqlRes.json();
  console.log("📦 GraphQL Result:", JSON.stringify(result, null, 2));

  const errors = result?.data?.customerUpdate?.userErrors ?? [];
  
  if (errors.length > 0) {
    console.error("❌ GraphQL Errors:", errors);
    return new Response(JSON.stringify({ 
      success: false, 
      errors 
    }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const savedValue = result.data?.customerUpdate?.customer?.metafield?.value;
  console.log("✅ Successfully saved style DNA:", savedValue);

  return new Response(JSON.stringify({
    success: true,
    value: savedValue,
    customerId: session.customer.id
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

// Handler for creating customer account with style DNA
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

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new Response(JSON.stringify({ 
      success: false,
      error: "Invalid email address" 
    }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  console.log("✅ Creating customer account:", email, "Style:", styleDNA);

  const mutation = `
    mutation CreateCustomerWithStyleDNA($input: CustomerInput!) {
      customerCreate(input: $input) {
        customer {
          id
          email
          metafield(namespace: "custom", key: "style_dna") {
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const gqlRes = await admin.graphql(mutation, {
    variables: {
      input: {
        email: email,
        emailMarketingConsent: {
          marketingState: "NOT_SUBSCRIBED",
          marketingOptInLevel: "SINGLE_OPT_IN"
        },
        metafields: [{
          namespace: "custom",
          key: "style_dna",
          type: "single_line_text_field",
          value: styleDNA,
        }],
      },
    },
  });

  const result = await gqlRes.json();
  console.log("📦 GraphQL Result:", JSON.stringify(result, null, 2));

  const errors = result?.data?.customerCreate?.userErrors ?? [];
  
  if (errors.length > 0) {
    console.error("❌ GraphQL Errors:", errors);
    
    // Check if customer already exists - look for various error patterns
    const existingCustomerError = errors.find(e => 
      e.message?.toLowerCase().includes('taken') || 
      e.message?.toLowerCase().includes('already exists') ||
      e.message?.toLowerCase().includes('expected pattern') ||
      e.field?.includes('email')
    );
    
    if (existingCustomerError) {
      console.log("ℹ️ Customer exists, updating style DNA instead");
      
      const searchQuery = `
        query FindCustomer($query: String!) {
          customers(first: 1, query: $query) {
            edges {
              node {
                id
                email
              }
            }
          }
        }
      `;
      
      const searchRes = await admin.graphql(searchQuery, {
        variables: {
          query: `email:${email}`
        }
      });
      
      const searchResult = await searchRes.json();
      const customerId = searchResult?.data?.customers?.edges?.[0]?.node?.id;
      
      if (customerId) {
        const updateMutation = `
          mutation UpdateCustomerStyleDNA($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                email
                metafield(namespace: "custom", key: "style_dna") {
                  value
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;
        
        const updateRes = await admin.graphql(updateMutation, {
          variables: {
            input: {
              id: customerId,
              metafields: [{
                namespace: "custom",
                key: "style_dna",
                type: "single_line_text_field",
                value: styleDNA,
              }],
            },
          },
        });
        
        const updateResult = await updateRes.json();
        const updateErrors = updateResult?.data?.customerUpdate?.userErrors ?? [];
        
        if (updateErrors.length > 0) {
          return new Response(JSON.stringify({ 
            success: false,
            error: "Failed to update existing account"
          }), { 
            status: 400,
            headers: { "Content-Type": "application/json" }
          });
        }
        
        return new Response(JSON.stringify({
          success: true,
          existing: true,
          message: "Your Style DNA has been saved to your existing account"
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }
    }
    
    return new Response(JSON.stringify({ 
      success: false,
      error: errors[0]?.message || "Failed to create account"
    }), { 
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const customer = result.data?.customerCreate?.customer;
  console.log("✅ Customer created:", customer?.id);

  return new Response(JSON.stringify({
    success: true,
    customerId: customer?.id,
    email: customer?.email,
    styleDNA: customer?.metafield?.value
  }), {
    headers: { "Content-Type": "application/json" }
  });
}

// Main proxy route handler
export const action = async ({ request }) => {
  try {
    const { session, admin } = await authenticate.public.appProxy(request);
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Route to appropriate handler based on path
    if (pathname.includes('/style-dna')) {
      return await handleStyleDNA(request, admin, session);
    } else if (pathname.includes('/create-account')) {
      return await handleCreateAccount(request, admin);
    }

    return new Response(JSON.stringify({ 
      error: "Unknown route" 
    }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("💥 Proxy Error:", e);
    return new Response(JSON.stringify({ 
      error: e.message,
      stack: e.stack 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};
