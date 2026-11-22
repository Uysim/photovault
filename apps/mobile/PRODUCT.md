# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

A small team or community that stores and shares photos and videos together, using invite-only accounts. On the phone, members sign in, pick photos and videos from their library to upload, browse the shared gallery, and open items in a full-screen viewer. They are typically on a phone, often on mobile data, with the media already on the device. (Audience specifics inferred from "small team or community"; refine if more specific.)

## Product Purpose

The mobile app is the primary capture-and-contribute surface for PhotoVault, private photo and video hosting the group controls: get media off the phone and into the shared vault, then browse and view it. Success: uploads complete reliably and the gallery and viewer feel native and fast.

## Positioning

Private, invite-only hosting in the group's own S3 bucket, not a public photo service. The phone uploads originals and a 480px thumbnail directly to storage. (Inferred from the repository; confirm before using as public claims.)

## Operating Context

Expo (expo-router) app for iOS and Android. Sign-in via Better Auth with tokens in `expo-secure-store`. Media picked with `expo-image-picker` (photos permission requested with a plain-language reason); video plays with `expo-video`. Upload flow: init, PUT original and thumbnail to presigned URLs, complete. Needs `EXPO_PUBLIC_API_URL`. Built with EAS.

## Capabilities and Constraints

- Screens today: sign-in, gallery (index), full-screen viewer, upload from picker, personal albums (list, album view, select mode and album picker).
- Dark only (`userInterfaceStyle: dark`); portrait orientation; iOS supports tablet.
- Android requests RECORD_AUDIO (video).
- Not built, undecided: auto-backup, sharing albums with other members, quotas, resumable uploads for huge videos.

## Brand Commitments

App name "PhotoVault"; URL scheme `photovault`. Placeholder bundle id `com.example.photovault` (not final).

## Evidence on Hand

No testimonials, usage metrics, or brand assets in the repo; do not fabricate any.

## Product Principles

- Native on each OS: follow iOS and Android conventions where they differ, not one imposed look.
- The media leads; chrome recedes, especially in the gallery and viewer.
- Upload state is always visible and trustworthy: progress, failure, and retry are never ambiguous.
- Private by default, with minimal friction once signed in.
- Web and mobile are one product: same vocabulary and behavior for the same actions.

## Accessibility & Inclusion

The app is dark-only by design (media-first); respect platform text-size and accessibility settings. No further product-specific standard established.
