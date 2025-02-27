import { GitService } from './gitService';
import * as fs from 'fs';
import * as path from 'path';

async function main() {
    try {
        console.log('Starting debug script');
        
        // Get the repository path
        const repoPath = process.cwd();
        console.log(`Repository path: ${repoPath}`);
        
        // Check if path exists
        if (!fs.existsSync(repoPath)) {
            console.error(`Repository path does not exist: ${repoPath}`);
            return;
        }
        
        // Check if .git directory exists
        const gitDir = path.join(repoPath, '.git');
        const hasGitDir = fs.existsSync(gitDir);
        console.log(`.git directory exists: ${hasGitDir}`);
        
        if (!hasGitDir) {
            console.error(`Not a git repository - .git directory not found in ${repoPath}`);
            return;
        }
        
        // Initialize GitService
        const gitService = new GitService();
        console.log('GitService initialized');
        
        // Set repository
        await gitService.setRepository(repoPath);
        console.log('Repository set');
        
        // Check if it's a git repository
        const isGitRepo = await gitService.isGitRepository();
        console.log(`Is Git repository: ${isGitRepo}`);
        
        if (isGitRepo) {
            // Get commits
            console.log('Getting commits...');
            const commits = await gitService.getCommits({ maxCount: 10 });
            console.log(`Found ${commits.length} commits`);
            
            if (commits.length > 0) {
                console.log('\nCommits:');
                commits.forEach((commit, index) => {
                    console.log(`${index + 1}. ${commit.hash.substring(0, 7)} - ${commit.author} - ${commit.date} - ${commit.message}`);
                });
            }
            
            // Get branches
            console.log('\nGetting branches...');
            const branches = await gitService.getBranches();
            console.log(`Found ${branches.length} branches: ${branches.join(', ')}`);
        }
        
        console.log('\nDebug script completed successfully');
    } catch (error) {
        console.error(`Error in debug script: ${error}`);
    }
}

main().catch(error => {
    console.error(`Unhandled error in main: ${error}`);
});
