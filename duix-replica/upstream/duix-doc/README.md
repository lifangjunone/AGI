# Mintlify Project Local Development & Deployment Guide

## Local Development & Online Deployment Workflow

Follow the steps below to run the Mintlify documentation project locally and push your updates to the official online environment\.

### 1\. Install Mintlify CLI Globally

Install the official Mint CLI tool on your local machine for local preview and development\.

```bash
npm install mint -g
```

### 2\. Run the Project Locally

Start the local development server to preview document changes in real time\.

```bash
mint dev
```

### 3\. Push Updates to Online Environment

After modifying the project code and committing changes to the `main` branch, complete the following steps to trigger official online deployment \(Mintlify requires manual access synchronization to take effect\):

1. Navigate to your **Mintlify Dashboard**

2. Open the **Settings** menu and select **Git settings**

3. In the **GitHub App** section, click the settings button next to **Configure GitHub App**

4. Select the **duixcom** organization \(ensure you are the owner of the `duix-doc` project\)

5. Select the **duix\-doc** project on the redirected page

6. Click **Update access** to synchronize permissions and complete the online content update

**Note**: Direct Git push to the main branch will not automatically update the online documentation\. You must complete the GitHub App access update step to trigger official deployment\.
