import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  
  const formData = await request.formData();
  const customerId = formData.get("customerId");
  const styleDNA = formData.get("styleDNA");

  console.log("✅ Received:", { customerId, styleDNA });

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
  console.log("📦 Result:", JSON.stringify(result, null, 2));

  const errors = result?.data?.customerUpdate?.userErrors ?? [];
  
  return {
    success: errors.length === 0,
    errors,
    value: result.data?.customerUpdate?.customer?.metafield?.value,
  };
};

export default function Index() {
  return (
    <div style={{ padding: 20 }}>
      <h1>Save Customer Style DNA</h1>
      <form method="post">
        <input type="hidden" name="customerId" value="gid://shopify/Customer/9741559693640" />
        <input type="hidden" name="styleDNA" value="Refined Contemporary" />
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px' }}>
          Save Style DNA
        </button>
      </form>
    </div>
  );
}