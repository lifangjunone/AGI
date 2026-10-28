package main

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func (a *app) deployProfile(w http.ResponseWriter, r *http.Request, c claims) {
	// Legacy host-wide symlink activation is unsafe across tenants. Fail closed
	// until the isolated, verified image driver is configured.
	fail(w, 503, "isolated_deployment_required", "Legacy shared-host deployment is disabled. Configure an isolated verified-image deployment target.")
}

func (a *app) legacyDeployProfile(w http.ResponseWriter, r *http.Request, c claims) {
	a.ensureNative(c.TenantID)
	a.mu.RLock()
	storageKey, profile, ok := a.profileEntryByID(r.PathValue("id"), c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	if profile.PackageID != "native-agentloop" || profile.DeploymentMode != "managed" {
		fail(w, 422, "deployment_not_managed", "this runtime is connected as an external endpoint")
		return
	}
	if a.engineRoot == "" {
		fail(w, 503, "deployment_driver_unavailable", "local process deployment is not configured")
		return
	}
	var input struct {
		Version string `json:"version"`
	}
	if !decode(w, r, &input) {
		return
	}
	input.Version = strings.TrimPrefix(strings.TrimSpace(input.Version), "v")
	if !validVersion(input.Version) {
		fail(w, 422, "invalid_version", "select a version from the package catalog")
		return
	}
	now := time.Now().UTC()
	record := deploymentRecord{
		ID: id("dep"), ProfileID: profile.ID, PackageID: profile.PackageID,
		Version: input.Version, PreviousVersion: profile.CurrentVersion,
		Status: "running", Stage: "validating", CreatedAt: now, UpdatedAt: now,
	}
	profile.DesiredVersion, profile.DeploymentStatus, profile.UpdatedAt = input.Version, "validating", now
	a.mu.Lock()
	a.profiles[storageKey] = profile
	a.deployments[profile.ID+":"+c.TenantID] = record
	a.persistLocked()
	a.mu.Unlock()
	go a.runLocalDeployment(storageKey, c.TenantID, record)
	write(w, http.StatusAccepted, record)
}

func (a *app) getDeployment(w http.ResponseWriter, r *http.Request, c claims) {
	a.mu.RLock()
	_, _, profileOK := a.profileEntryByID(r.PathValue("id"), c.TenantID)
	item, deploymentOK := a.deployments[r.PathValue("id")+":"+c.TenantID]
	a.mu.RUnlock()
	if !profileOK {
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	if !deploymentOK {
		write(w, 200, map[string]any{"status": "idle", "stage": "idle"})
		return
	}
	write(w, 200, item)
}

func (a *app) rollbackProfile(w http.ResponseWriter, r *http.Request, c claims) {
	fail(w, 503, "isolated_deployment_required", "Legacy shared-host rollback is disabled. Inspect the target and use an isolated deployment driver.")
}

func (a *app) legacyRollbackProfile(w http.ResponseWriter, r *http.Request, c claims) {
	a.ensureNative(c.TenantID)
	a.mu.RLock()
	storageKey, profile, ok := a.profileEntryByID(r.PathValue("id"), c.TenantID)
	a.mu.RUnlock()
	if !ok {
		fail(w, 404, "not_found", "runtime profile not found")
		return
	}
	if profile.PreviousVersion == "" {
		fail(w, 422, "rollback_unavailable", "no previous known-good version is available")
		return
	}
	now := time.Now().UTC()
	record := deploymentRecord{
		ID: id("dep"), ProfileID: profile.ID, PackageID: profile.PackageID,
		Version: profile.PreviousVersion, PreviousVersion: profile.CurrentVersion,
		Status: "running", Stage: "deploying", Message: "Rolling back to previous known-good version",
		CreatedAt: now, UpdatedAt: now,
	}
	a.mu.Lock()
	a.deployments[profile.ID+":"+c.TenantID] = record
	profile.DesiredVersion, profile.DeploymentStatus = profile.PreviousVersion, "deploying"
	a.profiles[storageKey] = profile
	a.persistLocked()
	a.mu.Unlock()
	go a.activateInstalledVersion(storageKey, c.TenantID, record)
	write(w, http.StatusAccepted, record)
}

func validVersion(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	for _, ch := range value {
		if (ch < '0' || ch > '9') && ch != '.' && ch != '-' {
			return false
		}
	}
	return true
}

func (a *app) runLocalDeployment(storageKey, tenantID string, record deploymentRecord) {
	item := a.packages[record.PackageID]
	a.updateDeployment(tenantID, record, "running", "validating", "Resolving release metadata")
	artifactURL, checksum, commit, err := a.resolveArtifact(context.Background(), item, record.Version)
	if err != nil {
		a.failDeployment(storageKey, tenantID, record, err)
		return
	}
	a.updateDeployment(tenantID, record, "running", "pulling", "Downloading and verifying engine artifact")
	versionDir := filepath.Join(a.engineRoot, record.PackageID, record.Version)
	if err := os.MkdirAll(versionDir, 0o755); err != nil {
		a.failDeployment(storageKey, tenantID, record, err)
		return
	}
	target := filepath.Join(versionDir, "engine")
	if !a.versionInstalled(record.PackageID, record.Version) {
		temp := target + ".download"
		if err := a.downloadVerified(context.Background(), artifactURL, checksum, temp); err != nil {
			_ = os.Remove(temp)
			a.failDeployment(storageKey, tenantID, record, err)
			return
		}
		if err := os.Chmod(temp, 0o755); err != nil {
			a.failDeployment(storageKey, tenantID, record, err)
			return
		}
		if err := os.Rename(temp, target); err != nil {
			a.failDeployment(storageKey, tenantID, record, err)
			return
		}
	}
	a.updateDeployment(tenantID, record, "running", "deploying", "Activating immutable engine version")
	if err := activateSymlink(filepath.Join(a.engineRoot, record.PackageID), record.Version); err != nil {
		a.failDeployment(storageKey, tenantID, record, err)
		return
	}
	record.Message = "Engine commit " + commit
	a.verifyDeployment(storageKey, tenantID, record)
}

func (a *app) activateInstalledVersion(storageKey, tenantID string, record deploymentRecord) {
	if !a.versionInstalled(record.PackageID, record.Version) {
		a.failDeployment(storageKey, tenantID, record, fmt.Errorf("previous engine version is no longer installed"))
		return
	}
	if err := activateSymlink(filepath.Join(a.engineRoot, record.PackageID), record.Version); err != nil {
		a.failDeployment(storageKey, tenantID, record, err)
		return
	}
	a.verifyDeployment(storageKey, tenantID, record)
}

func activateSymlink(packageRoot, version string) error {
	temp := filepath.Join(packageRoot, ".current-"+strconv.FormatInt(time.Now().UnixNano(), 10))
	if err := os.Symlink(filepath.Join(version, "engine"), temp); err != nil {
		return err
	}
	return os.Rename(temp, filepath.Join(packageRoot, "current"))
}

func (a *app) resolveArtifact(ctx context.Context, item runtimePackage, version string) (string, string, string, error) {
	platform, architecture := runtime.GOOS, runtime.GOARCH
	apiArch := architecture
	if architecture == "amd64" {
		apiArch = "x86_64"
	}
	if platform != "linux" || (apiArch != "x86_64" && apiArch != "arm64") {
		return "", "", "", fmt.Errorf("unsupported local deployment platform %s/%s", platform, architecture)
	}
	url := fmt.Sprintf("https://build.stencil.so/api/products/%s/versions/%s/linux-%s", item.ReleaseSource.Product, version, apiArch)
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	res, err := a.client.Do(req)
	if err != nil {
		return "", "", "", err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return "", "", "", fmt.Errorf("release metadata returned HTTP %d", res.StatusCode)
	}
	var result struct {
		Download string `json:"download"`
		Build    struct {
			Commit string `json:"commit"`
			Files  []struct {
				Platform string `json:"platform"`
				Arch     string `json:"arch"`
				SHA256   string `json:"sha256"`
			} `json:"files"`
		} `json:"build"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 4<<20)).Decode(&result); err != nil {
		return "", "", "", err
	}
	checksum := ""
	for _, file := range result.Build.Files {
		if file.Platform == "linux" && file.Arch == apiArch {
			checksum = file.SHA256
			break
		}
	}
	if result.Download == "" || len(checksum) != 64 {
		return "", "", "", fmt.Errorf("release does not contain a verified Linux artifact")
	}
	return result.Download, checksum, result.Build.Commit, nil
}

func (a *app) downloadVerified(ctx context.Context, url, expected, target string) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	res, err := a.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("artifact download returned HTTP %d", res.StatusCode)
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o600)
	if err != nil {
		return err
	}
	hash := sha256.New()
	_, copyErr := io.Copy(io.MultiWriter(file, hash), io.LimitReader(res.Body, 1<<30))
	closeErr := file.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !hmac.Equal([]byte(actual), []byte(strings.ToLower(expected))) {
		return fmt.Errorf("artifact checksum verification failed")
	}
	return nil
}

func (a *app) verifyDeployment(storageKey, tenantID string, record deploymentRecord) {
	a.updateDeployment(tenantID, record, "running", "verifying", "Verifying Runtime health")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, a.workerURL+"/healthz", nil)
	res, err := a.client.Do(req)
	if err != nil || res.StatusCode >= 300 {
		if record.PreviousVersion != "" && a.versionInstalled(record.PackageID, record.PreviousVersion) {
			_ = activateSymlink(filepath.Join(a.engineRoot, record.PackageID), record.PreviousVersion)
		}
		if err == nil {
			err = fmt.Errorf("Runtime health check returned HTTP %d", res.StatusCode)
			res.Body.Close()
		}
		a.failDeployment(storageKey, tenantID, record, err)
		return
	}
	res.Body.Close()
	now := time.Now().UTC()
	record.Status, record.Stage, record.Message, record.UpdatedAt = "ready", "ready", "Version is ready", now
	a.mu.Lock()
	profile := a.profiles[storageKey]
	profile.PreviousVersion = record.PreviousVersion
	profile.CurrentVersion, profile.DesiredVersion = record.Version, record.Version
	profile.DeploymentStatus, profile.LastDeploymentAt, profile.UpdatedAt = "ready", now, now
	a.profiles[storageKey] = profile
	a.deployments[profile.ID+":"+tenantID] = record
	a.persistLocked()
	a.mu.Unlock()
}

func (a *app) updateDeployment(tenantID string, record deploymentRecord, status, stage, message string) {
	record.Status, record.Stage, record.Message, record.UpdatedAt = status, stage, message, time.Now().UTC()
	a.mu.Lock()
	a.deployments[record.ProfileID+":"+tenantID] = record
	for key, profile := range a.profiles {
		if profile.ID == record.ProfileID && profile.TenantID == tenantID {
			profile.DeploymentStatus, profile.UpdatedAt = stage, record.UpdatedAt
			a.profiles[key] = profile
		}
	}
	a.persistLocked()
	a.mu.Unlock()
}

func (a *app) failDeployment(storageKey, tenantID string, record deploymentRecord, err error) {
	record.Status, record.Stage, record.Message, record.UpdatedAt = "failed", "failed", err.Error(), time.Now().UTC()
	a.mu.Lock()
	profile := a.profiles[storageKey]
	profile.DeploymentStatus, profile.DesiredVersion, profile.UpdatedAt = "failed", profile.CurrentVersion, record.UpdatedAt
	a.profiles[storageKey] = profile
	a.deployments[record.ProfileID+":"+tenantID] = record
	a.persistLocked()
	a.mu.Unlock()
}
