import 'dotenv/config'

import { Octokit } from 'octokit';
const octokit = new Octokit({
    auth: process.env.GITHUB_API_TOKEN
});

const githubEndpoint = 'https://api.github.com'

export const fetchData = async (username) => {
    const data = {}

    const profile = await octokit.request(
        `${githubEndpoint}/users/${username}`
    )

    const repos = await octokit.request(profile.data.repos_url)

    data.name = profile.data.name
    data.followers = profile.data.followers
    data.following = profile.data.following
    data.total_repo = profile.data.public_repos
    data.isHireable = profile.data.hireable
    data.bio = profile.data.bio
    data.joined_at = profile.data.created_at

    // Wait for all repository promises to resolve
    data.repositories = await Promise.all(repos.data.map(async (repo) => {
        const { name, fork, description, languages_url, updated_at } = repo

        const langs = await octokit.request(languages_url)
        const languages = Object.keys(langs.data).toString(', ') // Corrected to access `langs.data`

        return {
            name, is_private: repo.private, fork, description, languages, updated_at
        }
    }))

    return data
}

export const formatToString = (data) => JSON.stringify(data, null, 2).replace(/{/g, '').replace(/}/g, '').replace(/\[/g, '').replace(/]/g, '').replace(/"/g, '')

