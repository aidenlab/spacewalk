async function showRelease() {
    try {
        // Fetch all releases and find the one created most recently
        const response = await fetch('https://api.github.com/repos/aidenlab/spacewalk/releases?per_page=100')
        
        if (response.ok) {
            const releases = await response.json();
            
            if (releases && releases.length > 0) {
                // Sort by creation date (most recent first) and take the first one
                const sortedReleases = releases.sort((a, b) => {
                    const dateA = new Date(a.created_at);
                    const dateB = new Date(b.created_at);
                    return dateB - dateA; // Descending order (most recent first)
                });
                return sortedReleases[0];
            }
        } else {
            console.warn(`GitHub API returned ${response.status}: ${response.statusText}.`)
        }
    } catch(error) {
        console.error('Error fetching release tag:', error)
    }

    return null
}

export { showRelease }
