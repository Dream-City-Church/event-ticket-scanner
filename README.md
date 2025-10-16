# Dream City Church Ticket Scanner System

## Overview

This system has two main parts:

- **Ticket Scanner App:** Used by staff and volunteers to scan people in at events.
- **Ticket Display Widget:** Used by attendees to display their tickets on their phones. Purchasers see all tickets they bought; individual participants see their own ticket.

---

## System Components

### 1. Ticket Scanner App

- **Purpose:** Check in attendees quickly and reliably using QR codes.
- **Users:** Staff and volunteers.
- **Features:**
  - Live camera preview for scanning.
  - Success/error banners and sounds.
  - Searchable attendee list for manual lookup.
  - Local caching for offline resilience.
  - Syncs with backend API for attendee data and check-in status.
  - Resilient to temporary network interruptions with automatic caching/retry mechanisms.

### 2. Ticket Display Widget

- **Purpose:** Show attendees their ticket(s) for scanning.
- **Users:** Event participants and ticket purchasers.
- **Features:**
  - Lists all tickets for the purchaser; individual ticket for participants.
  - Each ticket shows name, event, date, status, and a QR code.
  - QR code encodes only the `Event_Participant_ID` for privacy and speed.
  - No physical ticket required—just show your phone.
  - Easy buttons to print or share tickets.

---

## How It Works

1. **Attendee opens their ticket page** and sees a QR code for each ticket.
2. **Greeter scans the QR** using the Scanner App.
3. **App checks the code** against the attendee list:
    - If valid and not checked in, marks as checked in, plays a success sound, and updates counters.
    - If already checked in, shows that attendee is already checked-in.
    - If invalid, shows an error.
4. **App syncs**:
    - Downloads attendee updates every 60 seconds.
    - Uploads new check-ins every 30 seconds.
    - Uses local storage to keep working if the network drops.

---

## Ticket Scanner App Details

- **Launching:** Open the scanner link with `?event={Event_GUID}` (e.g., `/scanner.html?event=abcd-1234-efgh-5678`). Missing or invalid event GUIDs show a clear error.
- **Camera Selection:** Prefers the main back camera. Avoids ultra-wide and depth cameras when possible.
- **Scanning:** Ignores duplicate scans within 2 seconds. Invalid or non-participant codes show “Invalid Code” or “Not Found.”
- **Manual Search:** Volunteers can search by name, email, phone, or Event Participant ID.
- **Check-in States:** Shows “CHECKED-IN” for new check-ins, “ALREADY CHECKED-IN” for repeats, and updates stats.
- **Local Storage:** Caches attendee data and check-in counts per event.
- **Feedback:** Success “ding” and green banner for check-in; error sound and red banner for problems.

---

## Ticket Display Widget Details

- **Where:** Embedded in the attendee portal or sent via event communications.
- **What Attendees See:**
  - Name, event title, date, QR code, and status (“Valid” or “Checked In”).
  - Optional: selected options and registration fee.
- **No printed ticket required.**

---

## Data Fields

- `Event_Participant_ID`
- `Participant_Name`
- `Email_Address`
- `Mobile_Phone`
- `Participation_Status_ID`
- `Checked_In` (boolean)
- `Checked_In_Date`
- `Event_Title`
- `Event_Start_Date`
- `Registration_Fee`
- `Selected_Options`

---

## Deployment & Configuration

- **Distribute scanner links** with the correct `event` parameter to staff/volunteers.
- **API:** Uses endpoints for GET (attendees) and POST (check-ins), with an `api-key` header.
- **Branding:** Can be themed with your church colors.

---

## Troubleshooting Table

| Error Message                                      | What to Do                                      |
|----------------------------------------------------|-------------------------------------------------|
| No Event ID Specified. Please check your event link.| Use the correct link with `?event=...`          |
| Event not found. Please check your event link.      | Verify event GUID and API availability            |
| No cameras found / Camera initialization failed     | Try another device or check browser permissions |
| Invalid Code                                       | Have attendee open their ticket page and retry  |
| Not Found                                          | Use Search and confirm attendee details         |

---

## Volunteer Runbook

- **Before Doors Open:**
  - Open the scanner link for the correct event.
  - Allow camera permission.
  - Confirm event name and date.
  - Do two test scans with staff tickets.
  - Keep one device on Search for manual lookups.
- **During Check-in:**
  - Scan, listen for the ding, watch for “CHECKED-IN.”
  - If error, scan again once, then use Search.
- **If Wi-Fi Drops:**
  - Keep scanning—app will sync when back online.
- **After Start Time:**
  - Verify totals in the status bar.

---

## Appendix A: QR and Status Rules

- **QR Payload:**  
  ```json
  {"Event_Participant_ID": <number>}
  ```
- **Ticket Validity:**  
  - `Participation_Status_ID < 3` = “Valid”
  - Otherwise = “Checked In”
- **Scanner Acceptance:**  
  - Only accepts if `Participation_Status_ID < 5`

---

## Appendix B: Sync & Caching

- **Downloads:** Every 60 seconds with `?timestamp={lastUpdated}` (sets `lastUpdated` to 10 seconds before “now”).
- **Uploads:** Every 30 seconds.
- **Local Cache:** Per event, so check-in/search works offline.

