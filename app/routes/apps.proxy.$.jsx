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
    
    const existingCustomerError = errors.find(e => 
      e.message?.toLowerCase().includes('taken') || 
      e.message?.toLowerCase().includes('already exists')
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

// Main action
export const action = async ({ request, params }) => {
  try {
    // Verify the app proxy request
    await authenticate.public.appProxy(request);
    
    const url = new URL(request.url);
    const shop = url.searchParams.get('shop');
    
    if (!shop) {
      throw new Error("Missing shop parameter");
    }

    // Import sessionStorage from shopify.server
    const { sessionStorage } = await import("../shopify.server");
    
    // Get offline session for admin access
    const sessionId = `offline_${shop}`;
    const session = await sessionStorage.loadSession(sessionId);
    
    console.log("🔍 Offline session:", session ? "exists" : "missing");
    
    if (!session) {
      throw new Error("App not installed on this shop");
    }

    // Create admin client manually
    const { shopifyApi } = await import("@shopify/shopify-app-react-router/server");
    const shopify = shopifyApi({
      apiVersion: "2026-04"
    });
    
    const admin = new shopify.clients.Graphql({ session });
    
    const path = params["*"];
    console.log("📍 Path:", path);

    if (path?.includes('create-account')) {
      return await handleCreateAccount(request, admin);
    }

    return new Response(JSON.stringify({ error: "Unknown route" }), { 
      status: 404,
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("💥 Error:", e);
    return new Response(JSON.stringify({ 
      error: e.message,
      stack: e.stack 
    }), { 
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
};