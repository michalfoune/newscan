# Newscan

Newscan is an AI news catch-up app designed to help users stay informed without getting dragged into doomscrolling, emotional overload, or unnecessarily distressing coverage.

## Core idea

The app gives users more control over both:

1. **What this specific newsfeed should contain**
2. **How the newsfeed should generally be constructed**

This allows a user to shape the feed at two levels:
- a **session prompt** for what they want right now
- a **persistent system preference** for the tone and balance of the feed overall

## Example user request

A user might say:

> Give me one short update about the Russia-Ukraine war, and then some good news from photography or wildlife conservation.

## Feed design principles

The app is built around a few core principles:

- Let users include and exclude topics explicitly
- Keep news concise, factual, and high-level
- Avoid sensationalism, clickbait, and emotionally manipulative framing
- Do not over-focus on disasters, war, tragedy, or outrage
- Avoid deep, graphic, or excessively detailed coverage of negative events
- Maintain a healthier emotional balance in the overall feed

## Example system-level preferences

Examples of general rules the app may follow:

- Never include more than 1-2 negative or concerning stories in one feed
- Keep the balance roughly **60% neutral or positive** and **no more than 40% negative or concerning**
- Do not offer in-depth coverage of wars or disasters by default
- Keep headlines calm, factual, and non-depressive
- Prioritize signal over noise

## Product goal

Newscan is not trying to maximize engagement through fear, outrage, or compulsive scrolling.

Its goal is to help users:
- stay aware of important events
- keep perspective
- reduce unnecessary emotional drain
- consume news more intentionally

## Possible stack

- **Frontend:** TypeScript
- **Backend:** Python
- **AI layer:** LLM-based summarization, filtering, ranking, and tone control

## Development

This project is being built locally with VS Code and GitHub, with implementation support from Claude Code.

## Status

Early concept and development stage.