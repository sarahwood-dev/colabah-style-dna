import { useActionData } from "@remix-run/react";

export default function SaveStyleDNA() {
  const actionData = useActionData();
  
  return (
    <div style={{ padding: 20 }}>
      <h1>Save Customer Style DNA</h1>
      <form method="post">
        <input type="hidden" name="customerId" value="gid://shopify/Customer/9652280492361" />
        <input type="hidden" name="styleDNA" value="Refined Contemporary" />
        <button type="submit" style={{ padding: '10px 20px', fontSize: '16px' }}>
          Save Style DNA
        </button>
      </form>
      
      {actionData && (
        <div style={{ marginTop: 20, padding: 15, background: actionData.success ? '#d4edda' : '#f8d7da' }}>
          <h3>{actionData.success ? '✅ Success!' : '❌ Error'}</h3>
          <pre>{JSON.stringify(actionData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}