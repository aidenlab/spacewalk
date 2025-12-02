#!/usr/bin/env node

/**
 * Script to migrate releases from igvteam/spacewalk to aidenlab/spacewalk
 * 
 * This script:
 * 1. Fetches all releases from the old repository (igvteam/spacewalk)
 * 2. Ensures tags exist in the new repository (aidenlab/spacewalk)
 * 3. Recreates releases in the new repository with the same metadata
 * 
 * Requirements:
 * - GitHub CLI (gh) must be authenticated
 * - Git must be configured
 * - Node.js >= 18.0.0
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';

const OLD_REPO = 'igvteam/spacewalk';
const NEW_REPO = 'aidenlab/spacewalk';
const OLD_REPO_URL = `https://github.com/${OLD_REPO}.git`;
const NEW_REPO_URL = `https://github.com/${NEW_REPO}.git`;

// Get GitHub token from gh CLI
function getGitHubToken() {
    try {
        return execSync('gh auth token', { encoding: 'utf-8' }).trim();
    } catch (error) {
        console.error('Error getting GitHub token. Make sure GitHub CLI is authenticated:');
        console.error('  Run: gh auth login');
        process.exit(1);
    }
}

// Fetch releases from GitHub API
async function fetchReleases(repo, token) {
    const releases = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
        const url = `https://api.github.com/repos/${repo}/releases?page=${page}&per_page=100`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch releases: ${response.status} ${response.statusText}`);
        }

        const pageReleases = await response.json();
        
        if (pageReleases.length === 0) {
            hasMore = false;
        } else {
            releases.push(...pageReleases);
            page++;
            // GitHub API returns max 100 per page, if we got less, we're done
            if (pageReleases.length < 100) {
                hasMore = false;
            }
        }
    }

    return releases;
}

// Create a release in the new repository
async function createRelease(repo, release, token) {
    const url = `https://api.github.com/repos/${repo}/releases`;
    
    const releaseData = {
        tag_name: release.tag_name,
        name: release.name || release.tag_name,
        body: release.body || '',
        draft: release.draft || false,
        prerelease: release.prerelease || false,
        // Note: assets need to be uploaded separately after release creation
    };

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(releaseData)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(`Failed to create release ${release.tag_name}: ${response.status} ${error.message || response.statusText}`);
    }

    return await response.json();
}

// Upload asset to a release
async function uploadAsset(uploadUrl, asset, token) {
    // Extract the upload URL template and replace placeholders
    const url = uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(asset.name)}`);
    
    // Download the asset first
    const assetResponse = await fetch(asset.browser_download_url);
    if (!assetResponse.ok) {
        throw new Error(`Failed to download asset ${asset.name}: ${assetResponse.statusText}`);
    }
    
    const assetBuffer = await assetResponse.arrayBuffer();
    
    // Upload to new release
    const uploadResponse = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': asset.content_type || 'application/octet-stream',
            'Content-Length': assetBuffer.byteLength.toString()
        },
        body: assetBuffer
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.json().catch(() => ({ message: uploadResponse.statusText }));
        throw new Error(`Failed to upload asset ${asset.name}: ${uploadResponse.status} ${error.message || uploadResponse.statusText}`);
    }

    return await uploadResponse.json();
}

// Ensure tags exist in new repository
async function ensureTagsExist(token) {
    console.log('\n📦 Step 1: Fetching tags from old repository and pushing to new repository...');
    
    try {
        // Check if we're in a git repo
        execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    } catch (error) {
        console.error('❌ Error: Not in a git repository. Please run this script from the spacewalk repository directory.');
        process.exit(1);
    }

    try {
        // Verify we're in the right repo (aidenlab/spacewalk)
        const currentRemote = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
        if (!currentRemote.includes('aidenlab/spacewalk')) {
            console.error('❌ Error: Current repository does not point to aidenlab/spacewalk');
            console.error(`   Current remote: ${currentRemote}`);
            process.exit(1);
        }

        // Add old repo as a remote if it doesn't exist
        try {
            execSync('git remote get-url old-origin', { stdio: 'ignore' });
            console.log('   ✓ Old repository remote already configured');
        } catch (e) {
            execSync(`git remote add old-origin ${OLD_REPO_URL}`, { stdio: 'inherit' });
            console.log('   ✓ Added old repository as remote');
        }

        // Fetch tags from old repository (force to overwrite existing)
        console.log('   Fetching tags from igvteam/spacewalk (overwriting existing tags)...');
        execSync('git fetch old-origin --tags --force', { stdio: 'inherit' });
        console.log('   ✓ Tags fetched from old repository');

        // Push tags to new repository (force to overwrite existing)
        console.log('   Pushing tags to aidenlab/spacewalk (overwriting existing tags)...');
        execSync('git push origin --tags --force', { stdio: 'inherit' });
        console.log('   ✓ Tags pushed to new repository\n');
    } catch (error) {
        console.error('❌ Error pushing tags:', error.message);
        console.error('\nYou may need to push tags manually:');
        console.error(`   git fetch old-origin --tags`);
        console.error(`   git push origin --tags`);
        process.exit(1);
    }
}

// Main migration function
async function migrateReleases() {
    console.log('🚀 Starting release migration...');
    console.log(`   From: ${OLD_REPO}`);
    console.log(`   To:   ${NEW_REPO}\n`);

    const token = getGitHubToken();
    console.log('✓ GitHub token obtained\n');

    // Step 1: Ensure tags exist
    await ensureTagsExist(token);

    // Step 2: Fetch all releases from old repository
    console.log('📥 Step 2: Fetching releases from old repository...');
    const releases = await fetchReleases(OLD_REPO, token);
    console.log(`   Found ${releases.length} releases\n`);

    if (releases.length === 0) {
        console.log('   No releases found. Nothing to migrate.');
        return;
    }

    // Step 3: Create releases in new repository
    console.log('📤 Step 3: Creating releases in new repository...\n');
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const release of releases) {
        try {
            console.log(`   Processing: ${release.tag_name}...`);
            
            // Check if release already exists
            const checkUrl = `https://api.github.com/repos/${NEW_REPO}/releases/tags/${release.tag_name}`;
            const checkResponse = await fetch(checkUrl, {
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (checkResponse.ok) {
                console.log(`     ⏭️  Release ${release.tag_name} already exists, skipping...`);
                skipCount++;
                continue;
            }

            // Create the release
            const newRelease = await createRelease(NEW_REPO, release, token);
            console.log(`     ✓ Created release: ${release.tag_name}`);

            // Upload assets if any
            if (release.assets && release.assets.length > 0) {
                console.log(`     📎 Uploading ${release.assets.length} asset(s)...`);
                for (const asset of release.assets) {
                    try {
                        await uploadAsset(newRelease.upload_url, asset, token);
                        console.log(`       ✓ Uploaded: ${asset.name}`);
                    } catch (error) {
                        console.log(`       ⚠️  Failed to upload ${asset.name}: ${error.message}`);
                    }
                }
            }

            successCount++;
            
            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.log(`     ❌ Error: ${error.message}`);
            errorCount++;
        }
    }

    // Summary
    console.log('\n✅ Migration complete!');
    console.log(`   ✓ Successfully migrated: ${successCount}`);
    console.log(`   ⏭️  Skipped (already exists): ${skipCount}`);
    console.log(`   ❌ Errors: ${errorCount}`);
    console.log(`\n   View releases at: https://github.com/${NEW_REPO}/releases`);
}

// Run the migration
migrateReleases().catch(error => {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
});

