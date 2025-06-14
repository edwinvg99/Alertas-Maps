
const BACKEND_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3001'
    : 'https://alertas-maps.up.railway.app/';

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupSidebarToggle();
});

async function initializeApp() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/config`);
        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.statusText}`);
        }
        const config = await response.json();
        loadGoogleMapsScript(config.googleMapsApiKey);

    } catch (error) {
        console.error('Error al inicializar la aplicación:', error);
        document.body.innerHTML = '<h1>Error al cargar la configuración de la aplicación. No se puede conectar con el servidor.</h1>';
    }
}

function loadGoogleMapsScript(apiKey) {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap&libraries=places,geometry&v=beta`;
    script.async = true;
    script.defer = true;
    
    document.body.appendChild(script);
}

window.initMap = function() {
    console.log('Google Maps cargado e inicializado.');
    
    const defaultCenter = { lat: 6.2762145, lng: -75.5583278 };

    map = new google.maps.Map(document.getElementById("map"), {
        zoom: 13,
        center: defaultCenter,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        suppressMarkers: false,
        polylineOptions: {
            strokeColor: '#6366f1',
            strokeWeight: 4,
            strokeOpacity: 0.8
        }
    });
    directionsRenderer.setMap(map);

    setupAutocomplete();
    setupEventListeners();

    map.addListener('click', (event) => {
        if (mapSelectionMode && currentSelectionMode) {
            handleMapClick(event.latLng);
        }
    });
};

let map, marker;
let routePath, currentPointIndex = 0;
let simulationInterval;
let alertedCheckpoints = new Set();
let checkpoints = [];
let currentRoute = null;
let mapSelectionMode = false;
let currentSelectionMode = null;
let originMarker = null;
let destinationMarker = null;
let checkpointMarkers = [];
let directionsService, directionsRenderer;
let originAutocomplete, destinationAutocomplete;

function setupAutocomplete() {
    const originInput = document.getElementById('originInput');
    const destinationInput = document.getElementById('destinationInput');
    
    if (!originInput || !destinationInput) {
        console.error('Elementos de input no encontrados');
        return;
    }

    const autocompleteOptions = {
        componentRestrictions: { country: 'co' }, // Restringir a Colombia
        fields: ['place_id', 'geometry', 'name', 'formatted_address'],
        types: ['geocode'] // Solo direcciones geocodificables
    };

    originAutocomplete = new google.maps.places.Autocomplete(originInput, autocompleteOptions);
    destinationAutocomplete = new google.maps.places.Autocomplete(destinationInput, autocompleteOptions);
    
    const setupMobileAutocomplete = () => {
        const sidebar = document.getElementById('sidebar');
        
        if (window.innerWidth <= 1024) {
            originAutocomplete.setOptions({
                ...autocompleteOptions,
                bounds: null
            });
            
            destinationAutocomplete.setOptions({
                ...autocompleteOptions,
                bounds: null
            });
            
            const adjustAutocompleteContainer = () => {
                const pacContainers = document.querySelectorAll('.pac-container');
                pacContainers.forEach(container => {
                    if (sidebar.classList.contains('active')) {
                        container.style.zIndex = '1002';
                        container.style.position = 'fixed';
                    } else {
                        container.style.zIndex = '1000';
                    }
                });
            };
            
            const observer = new MutationObserver(adjustAutocompleteContainer);
            observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
        }
    };
    
    setupMobileAutocomplete();
    
    window.addEventListener('resize', setupMobileAutocomplete);
    
    originAutocomplete.addListener('place_changed', () => {
        const place = originAutocomplete.getPlace();
        console.log('Lugar origen seleccionado:', place);
        if (place.geometry && place.geometry.location) {
            setOriginMarker(place.geometry.location);
            calculatePreviewRoute();
        }
    });
    
    destinationAutocomplete.addListener('place_changed', () => {
        const place = destinationAutocomplete.getPlace();
        console.log('Lugar destino seleccionado:', place);
        if (place.geometry && place.geometry.location) {
            setDestinationMarker(place.geometry.location);
            calculatePreviewRoute();
        }
    });
    
    const handleInputFocus = (input, autocomplete) => {
        input.addEventListener('focus', () => {
            if (window.innerWidth <= 1024) {
                // En móvil, asegurar que el sidebar esté visible cuando se enfoque el input
                const sidebar = document.getElementById('sidebar');
                if (!sidebar.classList.contains('active')) {
                    // Si el sidebar no está activo, no hacer nada especial
                    return;
                }
                
                setTimeout(() => {
                    const pacContainers = document.querySelectorAll('.pac-container');
                    pacContainers.forEach(container => {
                        container.style.zIndex = '1002';
                        container.style.position = 'fixed';
                        
                        // Ajustar posición si es necesario
                        const inputRect = input.getBoundingClientRect();
                        if (inputRect.top > window.innerHeight / 2) {
                            container.style.top = (inputRect.top - container.offsetHeight - 5) + 'px';
                        }
                    });
                }, 100);
            }
        });
    };
    
    handleInputFocus(originInput, originAutocomplete);
    handleInputFocus(destinationInput, destinationAutocomplete);
    
    originInput.addEventListener('blur', () => {
        setTimeout(calculatePreviewRoute, 500);
    });
    
    destinationInput.addEventListener('blur', () => {
        setTimeout(calculatePreviewRoute, 500);
    });
}

function setupEventListeners() {
    const startButton = document.getElementById("startButton");
    const stopButton = document.getElementById("stopButton");
    const startButtonMobile = document.getElementById("startButtonMobile");
    const stopButtonMobile = document.getElementById("stopButtonMobile");
    
    if (startButton) startButton.addEventListener("click", startSimulation);
    if (stopButton) stopButton.addEventListener("click", stopSimulation);
    if (startButtonMobile) startButtonMobile.addEventListener("click", startSimulation);
    if (stopButtonMobile) stopButtonMobile.addEventListener("click", stopSimulation);
    
    const toggleMapMode = document.getElementById("toggleMapMode");
    const clearCheckpoints = document.getElementById("clearCheckpoints");
    const setOriginMode = document.getElementById("setOriginMode");
    const setDestinationMode = document.getElementById("setDestinationMode");
    const addCheckpointMode = document.getElementById("addCheckpointMode");
    
    if (toggleMapMode) toggleMapMode.addEventListener("click", toggleMapModeFunction);
    if (clearCheckpoints) clearCheckpoints.addEventListener("click", clearAllCheckpoints);
    if (setOriginMode) setOriginMode.addEventListener("click", () => setSelectionMode('origin'));
    if (setDestinationMode) setDestinationMode.addEventListener("click", () => setSelectionMode('destination'));
    if (addCheckpointMode) addCheckpointMode.addEventListener("click", () => setSelectionMode('checkpoint'));
}

function setupSidebarToggle() {
    const toggleBtn = document.getElementById('toggleSidebar');
    const closeBtn = document.getElementById('closeSidebar');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.add('active');
            if (overlay) {
                overlay.classList.add('active');
                overlay.style.display = 'block';
            }
            
            setTimeout(() => {
                const pacContainers = document.querySelectorAll('.pac-container');
                pacContainers.forEach(container => {
                    container.style.zIndex = '1002';
                });
            }, 100);
        });
    }

    function closeSidebar() {
        sidebar.classList.remove('active');
        if (overlay) {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
        }
        
        setTimeout(() => {
            const pacContainers = document.querySelectorAll('.pac-container');
            pacContainers.forEach(container => {
                container.style.zIndex = '1000';
            });
        }, 350);
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', closeSidebar);
    }
    
    if (overlay) {
        overlay.addEventListener('click', closeSidebar);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            closeSidebar();
        }
    });
}

function toggleMapModeFunction() {
    mapSelectionMode = !mapSelectionMode;

    const modeInfo = document.getElementById('mapModeInfo');
    const toggleButton = document.getElementById('toggleMapMode');

    if (mapSelectionMode) {
        modeInfo.style.display = 'block';
        toggleButton.innerHTML = '<span class="btn-icon">❌</span>Desactivar modo selección';
        toggleButton.classList.remove('inactive');
        toggleButton.classList.add('active');
    } else {
        modeInfo.style.display = 'none';
        toggleButton.innerHTML = '<span class="btn-icon">🗺️</span>Activar modo selección';
        toggleButton.classList.remove('active');
        toggleButton.classList.add('inactive');
        currentSelectionMode = null;
        updateSelectionButtons();
    }
}

function calculatePreviewRoute() {
    const origin = document.getElementById('originInput').value;
    const destination = document.getElementById('destinationInput').value;
    const travelMode = document.getElementById('travelModeSelect').value;
    if (origin && destination) {
        directionsService.route({
            origin: origin,
            destination: destination,
            travelMode: google.maps.TravelMode[travelMode],
        }, (response, status) => {
            if (status === 'OK') {
                directionsRenderer.setDirections(response);
                currentRoute = response;
                showRouteInfo(response.routes[0]);
            } else {
                console.log('Error calculando ruta de vista previa:', status);
            }
        });
    }
}

function showRouteInfo(route) {
    const routeInfo = document.getElementById('routeInfo');
    const leg = route.legs[0];
    document.getElementById('routeDistance').textContent = `Distancia: ${leg.distance.text}`;
    document.getElementById('routeDuration').textContent = `Duración: ${leg.duration.text}`;
    routeInfo.style.display = 'block';
}

function setSelectionMode(mode) {
    currentSelectionMode = mode;
    updateSelectionButtons();
}

function updateSelectionButtons() {
    const buttons = ['setOriginMode', 'setDestinationMode', 'addCheckpointMode'];
    buttons.forEach(buttonId => {
        const button = document.getElementById(buttonId);
        if (button) button.classList.remove('active');
    });
    if (currentSelectionMode) {
        const activeButton = currentSelectionMode === 'checkpoint' ? 'addCheckpointMode' : `set${currentSelectionMode.charAt(0).toUpperCase() + currentSelectionMode.slice(1)}Mode`;
        const button = document.getElementById(activeButton);
        if (button) button.classList.add('active');
    }
}

function handleMapClick(latLng) {
    switch (currentSelectionMode) {
        case 'origin': 
            setOriginMarker(latLng); 
            updateAddressInput('originInput', latLng); 
            break;
        case 'destination': 
            setDestinationMarker(latLng); 
            updateAddressInput('destinationInput', latLng); 
            break;
        case 'checkpoint': 
            addCheckpoint(latLng); 
            break;
    }
}

function setOriginMarker(location) {
    if (originMarker) originMarker.setMap(null);
    originMarker = new google.maps.Marker({
        position: location, 
        map: map, 
        title: "Punto de origen",
        icon: { 
            path: google.maps.SymbolPath.CIRCLE, 
            scale: 10, 
            fillColor: '#10b981', 
            fillOpacity: 1, 
            strokeWeight: 3, 
            strokeColor: 'white' 
        }
    });
}

function setDestinationMarker(location) {
    if (destinationMarker) destinationMarker.setMap(null);
    destinationMarker = new google.maps.Marker({
        position: location, 
        map: map, 
        title: "Punto de destino",
        icon: { 
            path: google.maps.SymbolPath.CIRCLE, 
            scale: 10, 
            fillColor: '#ef4444', 
            fillOpacity: 1, 
            strokeWeight: 3, 
            strokeColor: 'white' 
        }
    });
}

function addCheckpoint(location) {
    const message = prompt("Ingresa el mensaje de alerta para este punto:");
    if (message) {
        const checkpoint = { 
            lat: location.lat(), 
            lng: location.lng(), 
            message: message, 
            notify: true 
        };
        checkpoints.push(checkpoint);
        const marker = new google.maps.Marker({
            position: location, 
            map: map, 
            title: message,
            icon: { 
                path: google.maps.SymbolPath.CIRCLE, 
                scale: 8, 
                fillColor: '#f59e0b', 
                fillOpacity: 1, 
                strokeWeight: 2, 
                strokeColor: 'white' 
            }
        });
        checkpointMarkers.push(marker);
        showNotification(`Punto de alerta agregado: ${message}`);
    }
}

function updateAddressInput(inputId, latLng) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === 'OK' && results[0]) {
            document.getElementById(inputId).value = results[0].formatted_address;
            calculatePreviewRoute();
        }
    });
}

function clearAllCheckpoints() {
    checkpoints = [];
    checkpointMarkers.forEach(marker => marker.setMap(null));
    checkpointMarkers = [];
    alertedCheckpoints.clear();
    showNotification("✅ Todos los puntos de alerta han sido eliminados");
}

function startSimulation() {
    const travelMode = document.getElementById('travelModeSelect').value;
    let origin, destination;
    
    if (originMarker) {
        origin = originMarker.getPosition();
    } else {
        const originInput = document.getElementById('originInput').value;
        if (!originInput) { 
            showSpecialNotification('⚠️ Por favor, especifica un punto de origen', 'warning'); 
            return; 
        }
        origin = originInput;
    }
    
    if (destinationMarker) {
        destination = destinationMarker.getPosition();
    } else {
        const destinationInput = document.getElementById('destinationInput').value;
        if (!destinationInput) { 
            showSpecialNotification('⚠️ Por favor, especifica un punto de destino', 'warning'); 
            return; 
        }
        destination = destinationInput;
    }
    
    showSpecialNotification('🚀 Iniciando simulación...', 'info');
    calculateAndSimulateRoute(directionsService, directionsRenderer, origin, destination, travelMode);
}

function calculateAndSimulateRoute(directionsService, directionsRenderer, origen, destino, travelMode) {
    directionsService.route({
        origin: origen,
        destination: destino,
        travelMode: google.maps.TravelMode[travelMode],
    }, (response, status) => {
        if (status === 'OK') {
            directionsRenderer.setDirections(response);
            routePath = response.routes[0].overview_path;
            currentPointIndex = 0;
            alertedCheckpoints.clear();
            showRouteInfo(response.routes[0]);
            simulateMovement();
        } else {
            showSpecialNotification('❌ Error al calcular la ruta: ' + status, 'error');
        }
    });
}

function simulateMovement() {
    if (marker) marker.setMap(null);
    showSpecialNotification('🚗 Saliendo del punto de origen...', 'info');
    
    marker = new google.maps.Marker({
        position: routePath[currentPointIndex],
        map: map,
        title: "Vehículo en simulación",
        icon: { 
            path: google.maps.SymbolPath.CIRCLE, 
            scale: 8, 
            fillColor: '#6366f1', 
            fillOpacity: 1, 
            strokeWeight: 3, 
            strokeColor: 'white' 
        }
    });
    
    simulationInterval = setInterval(() => {
        if (currentPointIndex < routePath.length - 1) {
            currentPointIndex++;
            marker.setPosition(routePath[currentPointIndex]);
            checkForCheckpoints(marker.getPosition());
        } else {
            clearInterval(simulationInterval);
            showSpecialNotification('🎉 ¡Has llegado a tu destino!', 'success');
            setTimeout(() => { 
                showNotification("✅ Simulación completada exitosamente"); 
            }, 2000);
        }
    }, 500);
}

function stopSimulation() {
    clearInterval(simulationInterval);
    showSpecialNotification('⏸️ Simulación detenida', 'warning');
    setTimeout(() => { 
        showNotification("Simulación pausada por el usuario"); 
    }, 1500);
}

function checkForCheckpoints(position) {
    checkpoints.forEach((checkpoint) => {
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            position, 
            new google.maps.LatLng(checkpoint.lat, checkpoint.lng)
        );
        
        if (distance < 150 && !alertedCheckpoints.has(checkpoint.message)) {
            alertedCheckpoints.add(checkpoint.message);
            
            console.log('🚨 CHECKPOINT DETECTADO:', checkpoint.message);
            console.log('📍 Distancia:', distance.toFixed(2), 'metros');
            
            showSpecialNotification(`⚠️ ${checkpoint.message}`, 'warning');
            
            setTimeout(() => {
                console.log('📱 Enviando WhatsApp...');
                sendWhatsAppNotification(checkpoint.message);
            }, 500);
            
            setTimeout(() => {
                console.log('📧 Enviando Email...');
                sendEmailNotification(checkpoint.message);
            }, 1000);
            
            setTimeout(() => {
                showNotification(`📍 Alerta activada: ${checkpoint.message}`);
            }, 1500);
        }
    });
}

function showNotification(message) {
    const notification = document.getElementById("notification");
    if (notification) {
        notification.innerText = message;
        notification.style.display = "block";
        setTimeout(() => { 
            notification.style.display = "none"; 
        }, 4000);
    }
}

function showSpecialNotification(message, type = 'info') {
    const specialNotification = document.getElementById("specialNotification");
    if (!specialNotification) {
        console.error('Elemento specialNotification no encontrado');
        return;
    }
    
    specialNotification.className = 'special-notification';
    
    if (type) {
        specialNotification.classList.add(type);
    }
    
    specialNotification.innerText = message;
    specialNotification.style.display = "block";
    
    setTimeout(() => { 
        specialNotification.style.display = "none"; 
    }, 3000);
}

function sendWhatsAppNotification(message) {
    const phoneNumber = document.getElementById('phoneInput').value;
    if (!phoneNumber) { 
        console.warn('⚠️ No se ha especificado un número de teléfono para WhatsApp');
        showNotification('⚠️ Configura un número de WhatsApp para recibir alertas');
        return; 
    }
    
    console.log('📱 Enviando WhatsApp a:', phoneNumber);
    console.log('💬 Mensaje:', message);
    
    const whatsappMessage = encodeURIComponent(`🚗 Alerta de Ruta: ${message}`);
    const url = `https://wa.me/${phoneNumber}?text=${whatsappMessage}`;
    
    try {
        const newWindow = window.open(url, '_blank');
        if (newWindow) {
            console.log('✅ WhatsApp abierto exitosamente');
            showNotification('📱 WhatsApp abierto correctamente');
        } else {
            console.error('❌ Error: El navegador bloqueó la apertura de WhatsApp');
            showNotification('❌ Error: Revisar bloqueador de pop-ups');
        }
    } catch (error) {
        console.error('❌ Error al abrir WhatsApp:', error);
        showNotification('❌ Error al abrir WhatsApp');
    }
}

async function sendEmailNotification(message) {
    const email = document.getElementById('emailInput').value;
    if (!email) {
        console.warn('⚠️ No se ha especificado un correo electrónico');
        showNotification('⚠️ Configura un email para recibir alertas');
        return;
    }

    const emailData = {
        to_email: email,
        message: `🚗 Alerta de Ruta: ${message}`,
    };

    console.log('📧 Enviando email a:', email);
    console.log('📝 Contenido:', emailData);
    console.log('🌐 URL Backend:', `${BACKEND_URL}/api/send-email`);
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/send-email`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailData),
        });

        console.log('📡 Respuesta del servidor:', response.status);

        if (response.ok) {
            const result = await response.json();
            console.log("✅ Email enviado exitosamente:", result);
            showNotification('📧 Email enviado correctamente');
        } else {
            const errorData = await response.json();
            console.error("❌ Error desde el servidor al enviar email:", errorData);
            showNotification('❌ Error al enviar email: ' + (errorData.error || 'Error desconocido'));
        }
    } catch (error) {
        console.error("❌ Error de red al intentar enviar email:", error);
        showNotification('❌ Error de conexión al enviar email');
    }
}
