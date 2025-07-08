import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase, ref, set, get, remove } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// 🔧 Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyDHhNiCb1ZR5NZHjVjf4jppPZnz8yJDVK4",
  authDomain: "web-location-tracker.firebaseapp.com",
  databaseURL: "https://web-location-tracker-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "web-location-tracker",
  storageBucket: "web-location-tracker.firebasestorage.app",
  messagingSenderId: "893011462580",
  appId: "1:893011462580:web:6fceb8120b757e8db14ae1"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const userId = "user1";

let map, marker, lastLog = null;
let logList = [];

const tableBody = document.querySelector("#logTable tbody");
const downloadBtn = document.getElementById("downloadCsv");
const clearBtn = document.getElementById("clearLog");
const toggleBtn = document.getElementById("toggleTracking");
const distanceDisplay = document.getElementById("totalDistance");

let trackingInterval = null;
let trackingEnabled = true;

// 🧹 Clear log
clearBtn.addEventListener("click", async () => {
  if (confirm("แน่ใจว่าต้องการล้างข้อมูลทั้งหมด?")) {
    await remove(ref(db, `logs/${userId}`));
    alert("ลบเรียบร้อย");
    location.reload();
  }
});

// 📥 Download CSV
downloadBtn.addEventListener("click", () => {
  let csv = "Latitude,Longitude,Timestamp,Speed (km/h)\n";
  logList.forEach((item) => {
    csv += `${item.lat},${item.lng},${new Date(+item.ts).toLocaleString()},${item.speed ?? "-"}\n`;
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "location-log.csv";
  a.click();
  URL.revokeObjectURL(url);
});

// 📏 Calculate distance
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = deg => deg * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 🗺️ Map
function initMap(lat, lng) {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat, lng },
    zoom: 15
  });
  marker = new google.maps.Marker({ position: { lat, lng }, map });
}

function updateMarker(lat, lng) {
  const pos = { lat, lng };
  marker.setPosition(pos);
  map.setCenter(pos);
}

// 📈 Chart
function drawDistanceChart(labels, distances) {
  const ctx = document.getElementById("distanceChart").getContext("2d");
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'ระยะทางสะสม (กม.)',
        data: distances,
        borderColor: 'blue',
        fill: false,
        tension: 0.1
      }]
    }
  });
}

// 📊 Load log
function loadHistory() {
  get(ref(db, `logs/${userId}`)).then(snapshot => {
    const data = snapshot.val();
    if (!data || typeof data !== "object") return;

    const entries = Object.entries(data).sort((a, b) => a[0] - b[0]);
    logList = entries.map(([ts, val]) => ({ ...val, ts }));

    let prev = null, total = 0;
    const labels = [], distances = [], path = [];

    tableBody.innerHTML = "";

    logList.forEach((item, idx) => {
      let speed = "-";
      if (prev) {
        const dist = getDistanceKm(prev.lat, prev.lng, item.lat, item.lng);
        const timeDiff = (+item.ts - +prev.ts) / 3600000;
        if (timeDiff > 0) {
          speed = (dist / timeDiff).toFixed(2);
          total += dist;
        }
      }

      const row = tableBody.insertRow();
      row.innerHTML = `
        <td>${idx + 1}</td>
        <td>${item.lat.toFixed(5)}</td>
        <td>${item.lng.toFixed(5)}</td>
        <td>${new Date(+item.ts).toLocaleString()}</td>
        <td>${item.speed ?? speed}</td>
      `;

      labels.push(new Date(+item.ts).toLocaleTimeString());
      distances.push(total.toFixed(3));
      path.push({ lat: item.lat, lng: item.lng });
      prev = item;
    });

    distanceDisplay.textContent = total.toFixed(2);

    // Marker and Polyline
    path.forEach((pos, i) => {
      new google.maps.Marker({
        position: pos,
        map,
        label: `${i + 1}`
      });
    });

    new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: "#FF0000",
      strokeOpacity: 1.0,
      strokeWeight: 3,
      map
    });

    drawDistanceChart(labels, distances);
  });
}

// 🛰️ Start/Stop Tracking
function startTracking() {
  if (trackingInterval) return;
  trackingInterval = setInterval(() => {
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      const ts = Date.now();

      let speed = null;
      if (lastLog) {
        const dist = getDistanceKm(lastLog.lat, lastLog.lng, lat, lng);
        const timeDiff = (ts - lastLog.ts) / 3600000;
        if (timeDiff > 0) speed = +(dist / timeDiff).toFixed(2);
      }

      const log = { lat, lng };
      if (speed !== null) log.speed = speed;

      set(ref(db, `logs/${userId}/${ts}`), log);
      set(ref(db, `latest/${userId}`), { lat, lng });
      lastLog = { lat, lng, ts };

      if (!map) initMap(lat, lng);
      else updateMarker(lat, lng);
    });
  }, 5000);
}

function stopTracking() {
  clearInterval(trackingInterval);
  trackingInterval = null;
}

// 🎛 ปุ่ม toggle Tracking
toggleBtn.addEventListener("click", () => {
  if (trackingEnabled) {
    stopTracking();
    trackingEnabled = false;
    toggleBtn.textContent = "▶️ เริ่มการ Tracking";
  } else {
    startTracking();
    trackingEnabled = true;
    toggleBtn.textContent = "⏸ หยุดการ Tracking";
  }
});

// ⏱ เริ่มโหลดเมื่อเปิดเว็บ
startTracking();
setTimeout(loadHistory, 3000);
