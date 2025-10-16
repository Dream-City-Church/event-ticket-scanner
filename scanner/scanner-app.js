/* -----------------------------------------------------------
   scanner-app.js - Dream City Church Event Check-In App
   Uses html5-qrcode for scanning QR codes and interacts with a
   backend API to fetch and update attendee check-in status.
   ----------------------------------------------------------- */

const appVersion = "1.0.0";
console.log(`Event Ticket Scanner App v${appVersion}`);

// Get the event ID from the URL query string "event"
const params = new URLSearchParams(window.location.search);
const eventId = params.get("event");

if (!eventId) {
  document.getElementById("errorText").innerHTML = "No Event ID Specified<br />Please check your event link";
  document.getElementById("errorOverlay").classList.remove("hidden");
}

// Set API Endpoints and Keys
let apiGetParticipants = "https://logic-app.api-endpoint.com"+eventId;
let apiPostCheckIn = "https://logic-app.api-endpoint.com/checkin/";
let apiKey = "your-api-key-here";

// Set up app state
let attendees = [];
let attendeesUpdated = [];
let eventName = "Event Check-In";
let eventDate = "";
let myCheckIns = 0;
let numAttendees = 0;
let numCheckedIn = 0;
let downloadInterval = 60000; // 1 minute
let uploadInterval = 30000; // 30 seconds
var lastUpdated = new Date(Date.now() - 10000).toISOString(); // Initialize to 10 seconds before now

// Audio feedback
const audioSuccess = new Audio("success-ding.mp3");
const audioError = new Audio("error-sound.mp3");

// Status indicators
const downloadIndicator = document.getElementById("downloadIndicator");
const downloadErrorIndicator = document.getElementById("downloadErrorIndicator");
const uploadIndicator = document.getElementById("uploadIndicator");
const uploadErrorIndicator = document.getElementById("uploadErrorIndicator");

// Load any saved state from localStorage
const stored = localStorage.getItem(`attendees-${eventId}`);
if (stored) {
  attendees = JSON.parse(stored);
}

const eventDetailsStored = localStorage.getItem(`eventdetails-${eventId}`);
if (eventDetailsStored) {
  const details = JSON.parse(eventDetailsStored);
  eventName = details.name || eventName;
  eventDate = details.date || eventDate;
  document.getElementById("eventName").textContent = eventName;
  document.getElementById("eventDate").textContent = eventDate;
  document.title = 'Ticket Scanner App - ' + eventName;
}

const myCheckInsStored = localStorage.getItem(`mycheckins-${eventId}`);
if (myCheckInsStored) {
  myCheckIns = parseInt(myCheckInsStored, 10) || 0;
  document.getElementById("mycheckins").textContent = `#${myCheckIns}`;
}

// Main app startup
async function startScannerApp() {
  // Wait for successful API data load before starting scanner
  document.getElementById("cameraStatus").innerHTML = '<i class="fa-solid fa-spinner fa-spin-pulse fa-xl"></i><br />Loading event data...';
  await attendeeFirstLoad();
  document.getElementById("cameraStatus").innerHTML = '<i class="fa-solid fa-spinner fa-spin-pulse fa-xl"></i><br />Starting camera...';
  await startScanner();
  renderSearchList();
  document.getElementById("cameraStatus").classList.add("hidden");
  document.getElementById("cameraStatus").innerHTML = '';
}

// API GET attendees and event info
async function attendeeFirstLoad() {
  const data = await fetchAttendees();
  if (data) {
    downloadIndicator.classList.add("hidden");
    downloadErrorIndicator.classList.add("hidden");
    document.getElementById("searchBtn").classList.remove("hidden");
    eventName = data.Event_Title || eventName;
    eventDate = data.Event_Start_Date || eventDate;
    numAttendees = data.Num_Attendees || numAttendees;
    numCheckedIn = data.Num_Checked_In || numCheckedIn;
    attendees = data.Attendees_List || attendees;

    // Update localStorage
    localStorage.setItem(`attendees-${eventId}`, JSON.stringify(attendees));
    localStorage.setItem(`eventdetails-${eventId}`, JSON.stringify({ name: eventName, date: eventDate }));

    // Update UI
    document.getElementById("eventName").textContent = eventName;
    document.getElementById("eventDate").textContent = eventDate;
    document.getElementById("stats").textContent = `Checked In: ${numCheckedIn} / ${numAttendees}`;
    document.getElementById("mycheckins").textContent = `#${myCheckIns}`;
    document.title = 'Ticket Scanner App - ' + eventName;

    // Set lastUpdated to 10 seconds before now to avoid missing any rapid updates
    lastUpdated = new Date(Date.now() - 10000).toISOString();

  } else {
    downloadIndicator.classList.add("hidden");
    downloadErrorIndicator.classList.remove("hidden");
    console.error("Error fetching event info:", error);
    throw new Error("Failed to fetch event info");
  }
}


// Function to get attendees from API. Supports optional 'timestamp' query param.
async function fetchAttendees(since) {
  downloadIndicator.classList.remove("hidden");
  let url = apiGetParticipants;
  if (since) {
    url += `?timestamp=${since}`;
  }
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "api-key": apiKey
    }
  });
  if (!response.ok && response.status === 404) {
    document.getElementById("errorText").innerHTML = "Event not found<br />Please check your event link";
    document.getElementById("errorOverlay").classList.remove("hidden");
    document.getElementById("cameraStatus").innerHTML = '<i class="fa-solid fa-calendar-circle-exclamation fa-xl"></i>';
    stopScanner();
    document.getElementById("red-line").classList.add("hidden");
    document.getElementById("qr-reader").innerHTML = '';
    audioError.play().catch(() => { /* ignore play errors */ });
    throw new Error("Event not found");
  } else if (!response.ok) {
    console.log("API response not ok:", response.status, response.statusText);
    throw new Error("Failed to fetch attendees");
  }
  return response.json();
}

// --- html5-qrcode instance state ---
let html5QrCode = null;
let scanning = false;
let lastScan = { text: null, at: 0 };
const DEDUP_MS = 2000;

// Start the scanner using html5-qrcode.
// Prefers the back camera; falls back gracefully.
async function startScanner() {
  const READER_ID = "qr-reader";
  
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode(READER_ID, /* verbose */ false);
  }
  
  const config = {
    fps: 10,
    qrbox: (vw, vh) => {
      const minEdge = Math.min(vw, vh);
      const size = Math.max(150, Math.floor(minEdge * 0.6));
      return { width: size, height: size };
    },
    aspectRatio: 1,
    focusMode: "continuous",
    disableFlip: true
  };
  
  const onDecode = (decodedText, decodedResult) => {
    const now = Date.now();
    if (decodedText === lastScan.text && now - lastScan.at < DEDUP_MS) return;
    lastScan = { text: decodedText, at: now };
    handleScan(decodedText);
  };
  
  try {
    const devices = await Html5Qrcode.getCameras();
    
    if (!devices || devices.length === 0) {
      showError("No cameras found");
      document.getElementById("cameraStatus").innerHTML = '<i class="fa-solid fa-camera-slash fa-xl"></i>';
      return;
    }
    
    // Find all back-facing cameras
    const backCameras = devices.filter((d) => {
      const label = d.label.toLowerCase();
      return label.includes('back') || 
             label.includes('rear') || 
             label.includes('environment') ||
             label.includes('facing back') ||
             label.includes('facing-back') ||
             label.includes('facingback');
    });
    
    let selectedCamera = null;
    
    if (backCameras.length > 0) {
      // Score each back camera (higher score = better for QR scanning)
      const scoredCameras = backCameras.map(camera => {
        const label = camera.label.toLowerCase();
        let score = 0;
        
        // Prefer "main" or "standard" cameras
        if (label.includes('main') || label.includes('standard')) score += 10;
        
        // Prefer cameras with specific focal lengths good for QR codes
        if (label.includes('normal')) score += 8;
        
        // Slightly prefer "camera 0" or first back camera (often the main one)
        if (label.includes('camera 0') || label.includes('camera0')) score += 5;
        if (label.includes('back 0') || label.includes('rear 0')) score += 5;
        
        // Avoid ultra-wide cameras
        if (label.includes('wide') && !label.includes('ultra')) score += 2; // regular wide is ok
        if (label.includes('ultrawide') || label.includes('ultra-wide') || label.includes('ultra wide')) score -= 10;
        
        // Avoid telephoto/zoom cameras (too narrow field of view)
        if (label.includes('tele') || label.includes('zoom') || label.includes('telephoto')) score -= 5;
        
        // Avoid depth or ToF cameras
        if (label.includes('depth') || label.includes('tof') || label.includes('time-of-flight')) score -= 20;
        
        // On some devices, camera 2 is often ultra-wide
        if (label.includes('camera 2') || label.includes('camera2')) score -= 3;
        
        // Camera 1 is often the main camera on multi-camera setups
        if (label.includes('camera 1') || label.includes('camera1')) score += 3;
        
        return { camera, score };
      });
      
      // Sort by score (highest first)
      scoredCameras.sort((a, b) => b.score - a.score);
      
      selectedCamera = scoredCameras[0].camera;
      
    } else if (devices.length > 1) {
      // No explicitly labeled back camera, use platform heuristics
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      
      if (isIOS) {
        // On iOS, avoid the last camera (often ultra-wide)
        // The first or middle camera is usually the main one
        selectedCamera = devices[0];
      } else {
        // On Android without labeled cameras, try to avoid extremes
        // Middle camera is often the main one in a 3-camera setup
        if (devices.length >= 3) {
          selectedCamera = devices[Math.floor(devices.length / 2)];
        } else {
          selectedCamera = devices[devices.length - 1];
        }
      }
    } else {
      // Single camera fallback
      selectedCamera = devices[0];
    }
    
    await html5QrCode.start(selectedCamera.id, config, onDecode);
    scanning = true;
    
  } catch (err) {
    console.error("Camera initialization failed:", err);
    showError("Camera initialization failed: " + err.message);
    document.getElementById("cameraStatus").innerHTML = '<i class="fa-solid fa-camera-slash fa-xl"></i>';
  }
}

// Stop the scanner cleanly (for page unload, route changes, etc.)
function stopScanner() {
  if (html5QrCode && scanning) {
    html5QrCode
      .stop()
      .then(() => {
        scanning = false;
        html5QrCode.clear(); // remove viewfinder canvas, etc.
      })
      .catch(() => {
        // No-op: ignore stop errors
      });
  }
}
window.addEventListener("beforeunload", stopScanner);

// Handle QR scan -> checks in the attendee
function handleScan(content) {
  let scanned;
  try {
    scanned = JSON.parse(content);
  } catch (e) {
    showError("Invalid Code");
    return;
  }
  if (!scanned.Event_Participant_ID) {
    showError("Invalid Code");
    return;
  }
  const attendee = attendees.find(
    (a) => a.Event_Participant_ID === scanned.Event_Participant_ID && a.Participation_Status_ID < 5
  );
  if (!attendee) {
    showError("Not Found");
    return;
  }
  handleCheckIn(attendee.Event_Participant_ID);
}

// Show green success banner
function showStatus(attendee,message) {
  const banner = document.getElementById("statusBanner");
  banner.textContent = message;
  banner.classList.remove("success");
  banner.classList.remove("hidden");
  banner.classList.remove("error");
  setTimeout(() => banner.classList.add("success"), 10); // trigger reflow for animation
  document.getElementById("participantInfo").classList.remove("hidden");
  document.getElementById("participantName").textContent = attendee.Participant_Name;
  // Check if attendee.Checked_In_Date exists, otherwise use now
  const checkedInTime = attendee.Checked_In_Date || new Date().toISOString();
  document.getElementById("registrationDetails").innerHTML = `<span class="check-in-time">Checked In: ${new Date(checkedInTime).toLocaleString()}</span><br /><span class="event-participant-id">ID: ${attendee.Event_Participant_ID}</span>`;
  audioSuccess.play().catch(() => { /* ignore play errors */ });
}

// Show red error banner
function showError(message) {
  const banner = document.getElementById("statusBanner");
  banner.textContent = message;
  banner.classList.remove("error");
  banner.classList.remove("hidden");
  banner.classList.remove("success");
  setTimeout(() => banner.classList.add("error"), 10); // trigger reflow for animation
  document.getElementById("participantInfo").classList.add("hidden");
  audioError.play().catch(() => { /* ignore play errors */ });
}

// Search modal logic
document.getElementById("searchBtn")?.addEventListener("click", () => {
  document.getElementById("searchModal").classList.remove("hidden");
  renderSearchList();
});
document.getElementById("closeSearch")?.addEventListener("click", () => {
  document.getElementById("searchModal").classList.add("hidden");
  document.getElementById("searchInput").value = "";
  renderSearchList();
});
document.getElementById("searchInput")?.addEventListener("input", renderSearchList);

function renderSearchList() {
  const query = (document.getElementById("searchInput")?.value || "").toLowerCase().replace("-","");
  const list = document.getElementById("attendeeList");
  if (!list) return;
  list.innerHTML = "";
  attendees
    .filter((a) => 
      a.Participant_Name.toLowerCase().includes(query) ||
      a.Event_Participant_ID.toString().includes(query) ||
      (a.Email_Address && a.Email_Address.toLowerCase().includes(query)) ||
      (a.Mobile_Phone && a.Mobile_Phone.replace("-","").includes(query))
    )
    .forEach((a) => {
      const item = document.createElement("div");
      item.className = "attendee-item";
      item.innerHTML = `
        <span class="attendee-name">${a.Participant_Name}</span><span class="attendee-id">${a.Event_Participant_ID}</span>
        ${
          a.Checked_In_Date
            ? `<button class="checked">${
                new Date(a.Checked_In_Date).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                })
              }</button>`
            : `<button class="checkin" onclick="handleCheckIn(${a.Event_Participant_ID})">CHECK IN</button>`
        }
      `;
      list.appendChild(item);
    });
}

// Function to upload updated check-ins to API
async function uploadCheckIns() {
  if (attendeesUpdated.length === 0) return;
  uploadErrorIndicator.classList.add("hidden");
  uploadIndicator.classList.remove("hidden");
  try {
    const response = await fetch(apiPostCheckIn, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify(attendeesUpdated)
    });
    if (!response.ok) throw new Error("Network response was not ok");
    attendeesUpdated = []; // Clear the array after successful upload
    uploadIndicator.classList.add("hidden");
  } catch (error) {
    console.error("Error uploading check-ins:", error);
    uploadErrorIndicator.classList.remove("hidden");
  }
}

// Handle check-in logic
function handleCheckIn(id) {
  const attendee = attendees.find((a) => a.Event_Participant_ID === id);
  if (attendee) {
    // If already checked in, ignore
    if (attendee.Checked_In_Date !== null || attendee.Checked_In || attendee.Participation_Status_ID === 3 || attendee.Participation_Status_ID === 4) {
      showStatus(attendee,"ALREADY CHECKED-IN");
      return;
    }
    showStatus(attendee,"CHECKED-IN");
    attendee.Checked_In = true;
    attendee.Participation_Status_ID = 3;
    attendee.Checked_In_Date = new Date().toISOString();
    localStorage.setItem(`attendees-${eventId}`, JSON.stringify(attendees));
    attendeesUpdated.push(attendee);
    uploadCheckIns();
    renderSearchList();
    numCheckedIn++;
    myCheckIns++;
    localStorage.setItem(`mycheckins-${eventId}`, myCheckIns.toString());
    document.getElementById("stats").textContent = `Checked In: ${numCheckedIn} / ${numAttendees}`;
    document.getElementById("mycheckins").textContent = `#${myCheckIns}`;
  }
}

 // Upload every 30 seconds
setInterval(uploadCheckIns, uploadInterval);

// Download changes every 1 minute
setInterval(() => {
  // Find the most recent check-in time we have
  downloadIndicator.classList.remove("hidden");
  downloadErrorIndicator.classList.add("hidden");
  // Get updates since the last fetch
  fetchAttendees(lastUpdated)
    .then((data) => {
      downloadIndicator.classList.add("hidden");
      downloadErrorIndicator.classList.add("hidden");
      if (data && data.Attendees_List) {
        const newAttendees = data.Attendees_List;
        let updated = false;

        // Check for updates in the attendee list
        newAttendees.forEach((newAttendee) => {
          const existing = attendees.find((a) => a.Event_Participant_ID === newAttendee.Event_Participant_ID);
          if (existing) {
            // Update existing attendee
            Object.assign(existing, newAttendee);
            updated = true;
          } else {
            // Add new attendee
            attendees.push(newAttendee);
            updated = true;
          }
        });

        if (updated) {
          renderSearchList();
          localStorage.setItem(`attendees-${eventId}`, JSON.stringify(attendees));
          // Update stats if provided. Use the largest values to avoid regressions
          if (data.Num_Attendees) numAttendees = attendees.length;
          if (data.Num_Checked_In) numCheckedIn = attendees.filter(a => a.Checked_In || a.Participation_Status_ID === 3 || a.Participation_Status_ID === 4).length;
          document.getElementById("stats").textContent = `Checked In: ${numCheckedIn} / ${numAttendees}`;
        }

        // Update lastUpdated to 10 seconds before now to avoid missing any rapid updates
        lastUpdated = new Date(Date.now() - 10000).toISOString();
      }
    })
    .catch((e) => {
      downloadIndicator.classList.add("hidden");
      downloadErrorIndicator.classList.remove("hidden");
      console.error("Error fetching attendees:", e);
    });
}, downloadInterval);

// Start scanner on load
window.onload = startScannerApp;
