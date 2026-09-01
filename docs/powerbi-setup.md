# Power BI — Setup & Unblock Guide

## Current state

| Layer | Status |
|---|---|
| Dashboard embedding (`/dashboard`) | Working |
| AI tools: diagnose, discover datasets, report pages, visuals | Working |
| AI tools: DAX queries, schema, visual export | **Blocked** — needs Azure config below |
| User access to "PRISM Production" workspace | **Blocked** — needs Pro license |

---

## Part 1 — Assign a Power BI Pro license to your account

Your user account sees *"Upgrade to a paid Power BI license"* because a Pro or PPU license is required to access shared workspaces.

### Steps (Microsoft 365 Admin Center)

1. Go to **[admin.microsoft.com](https://admin.microsoft.com)** → **Billing** → **Licenses**
2. Assign a **Power BI Pro** (or **Premium Per User**) license to your user account
3. Wait up to 10 minutes for propagation
4. Sign out and back in at [app.powerbi.com](https://app.powerbi.com)
5. You can now open the "PRISM Production" workspace

**Cost:** ~$10/user/month for Pro, ~$20/user/month for PPU

---

## Part 2 — Enable service principal API access (unblocks 3 AI tools)

The service principal `98a8da1c-192c-4261-98c6-6cb29482c1f3` is already created. It needs two things:

### 2a. Grant tenant-level API permissions (Azure Portal)

1. Go to **[portal.azure.com](https://portal.azure.com)** → **App registrations** → find the app `98a8da1c-...`
2. **API permissions** → **Add a permission** → **Power BI Service**
3. Add **Application permission:** `Dataset.Read.All`
4. Click **Grant admin consent** (requires Global Admin or Privileged Role Admin)
5. While there, also add `Report.Read.All` (for visual export polling)

### 2b. Enable service principals in Power BI Admin Portal

1. Go to **[admin.powerbi.com](https://admin.powerbi.com)** → **Tenant settings**
2. Find **"Allow service principals to use Power BI APIs"** → **Enabled**
   - Apply to: the security group containing your service principal, or *"The entire organization"*
3. Find **"Allow service principals to use read-only admin APIs"** → **Enabled**

### 2c. Assign Fabric capacity to the workspace

This is the root cause of the 403 on dataset/report read APIs.

1. In **Azure Portal** → **Fabric capacities**
2. Create or locate a Fabric capacity (minimum **F2** SKU)
   - F2: ~$0.18/hour (~$130/month, can pause when not in use)
3. In **[app.powerbi.com](https://app.powerbi.com)** → Workspace **"PRISM Production"** → **Settings** → **Premium**
4. Under *"License mode"* select **Fabric capacity** and choose the F2 capacity you created

### 2d. Add service principal to the workspace

1. In **[app.powerbi.com](https://app.powerbi.com)** → Workspace **"PRISM Production"** → **Manage access**
2. **Add people or groups** → paste the service principal GUID: `98a8da1c-192c-4261-98c6-6cb29482c1f3`
3. Assign **Member** or **Contributor** role

---

## Part 3 — Verify everything works

After completing all steps above, run from this project root:

```powershell
node -e "
const env=Object.fromEntries(require('fs').readFileSync('.env','utf-8').split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('#')).map(l=>{const eq=l.indexOf('=');return eq>0?[l.slice(0,eq),l.slice(eq+1)]:[l,'']}));
(async()=>{
  const t=await fetch('https://login.microsoftonline.com/'+env.POWERBI_TENANT_ID+'/oauth2/v2.0/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.POWERBI_CLIENT_ID,client_secret:env.POWERBI_CLIENT_SECRET,grant_type:'client_credentials',scope:'https://analysis.windows.net/powerbi/api/.default'})});
  const d=await t.json();const b=d.token_type+' '+d.access_token;
  // Test dataset schema (was blocked)
  const s=await fetch('https://api.powerbi.com/v1.0/myorg/groups/'+env.POWERBI_WORKSPACE_ID+'/datasets/'+env.POWERBI_DATASET_ID+'/tables',{headers:{Authorization:b}});
  console.log('Schema:',s.status===200?'WORKING':'FAILED HTTP '+s.status);
  // Test DAX
  const q=await fetch('https://api.powerbi.com/v1.0/myorg/groups/'+env.POWERBI_WORKSPACE_ID+'/datasets/'+env.POWERBI_DATASET_ID+'/executeQueries',{method:'POST',headers:{Authorization:b,'Content-Type':'application/json'},body:JSON.stringify({queries:[{query:'EVALUATE {1}'}],serializerSettings:{includeNulls:true}})});
  console.log('DAX query:',q.status===200?'WORKING':'FAILED HTTP '+q.status);
})();
"
```

Expected output:
```
Schema: WORKING
DAX query: WORKING
```

---

## Summary — who does what

| Step | Who | System |
|---|---|---|
| Assign Pro license to your account | M365 Admin | admin.microsoft.com |
| Grant API permissions + admin consent | Azure Admin | portal.azure.com |
| Enable service principal tenant settings | Power BI Admin | admin.powerbi.com |
| Assign Fabric F2 to workspace | Power BI Admin | app.powerbi.com |
| Add service principal to workspace | Workspace Owner | app.powerbi.com |
