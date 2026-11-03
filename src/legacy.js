
        const appsScriptUrl = "https://script.google.com/macros/s/AKfycbzaoRIPAnfLmM5Q_KjpUoBeLM3jxmUWe0_myIDok65_LRk0kM3uG6yL9ajX1bQy_0c1/exec";
        const fleetCsvUrl = "https://docs.google.com/spreadsheets/d/1X1L0WLdgGPUonex6AKLEIumKR9Uw-ot-ifTe0pXsCbU/gviz/tq?tqx=out:csv&sheet=Sheet1";
        const sheetImageFiles = {
            '1n4TyJMQV1-5D0Gqt08LvEDhioFlcb1I9': '/vehicles/ertiga.jpg',
            '1ivlm_NwyRZPP-4f0LZlExFElu27pr0dT': '/vehicles/exter.jpg',
            '1VXtXvuemubbBO7rDrnJGZytevQniR8qT': '/vehicles/hero.jpg'
        };
        const fallbackFleet = [
            { name: 'Ertiga', type: 'Car', price: 3300, seats: 7, capacity: 2, imageUrl: '/vehicles/ertiga.jpg', calendarName: 'ertiga', active: true },
            { name: 'Exter', type: 'Car', price: 2500, seats: 5, capacity: 1, imageUrl: '/vehicles/exter.jpg', calendarName: 'exter', active: true },
            { name: 'i20', type: 'Car', price: 2500, seats: 5, capacity: 1, imageUrl: '', calendarName: 'i20', active: true },
            { name: 'Urban Cruiser', type: 'Car', price: 2700, seats: 5, capacity: 1, imageUrl: '', calendarName: 'urban cruiser', active: true }
        ];
        let fleetVehicles = fallbackFleet;
        let fleetFetchInProgress = false;
        let hasSheetData = false;
        let fleetSignature = '';
        let calendarEvents = [];
        let calendarReady = false;
        let calendarFetchInProgress = false;

        function toLocalDateInputValue(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function getEarliestPickupTime() {
            const earliest = new Date();
            earliest.setSeconds(0, 0);
            earliest.setMinutes(earliest.getMinutes() + 1);
            return earliest;
        }

        function toLocalTimeInputValue(date) {
            return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }

        function syncMinimumPickupTime() {
            const fromDate = document.getElementById('fromDate');
            const fromTime = document.getElementById('fromTime');
            if (!fromDate || !fromTime) return;

            const today = toLocalDateInputValue(new Date());
            fromDate.min = today;
            const minimumTime = fromDate.value === today ? toLocalTimeInputValue(getEarliestPickupTime()) : '';
            fromTime.min = minimumTime;
            if (minimumTime && fromTime.value && fromTime.value < minimumTime) {
                fromTime.value = minimumTime;
            }
        }

        function parseLocalDate(value) {
            if (!value) return null;
            const [year, month, day] = value.split('-').map(Number);
            return new Date(year, month - 1, day);
        }

        function addDays(date, days) {
            const next = new Date(date);
            next.setDate(next.getDate() + days);
            return next;
        }

        function parseCsv(text) {
            const rows = [];
            let row = [];
            let value = '';
            let quoted = false;

            for (let index = 0; index < text.length; index += 1) {
                const character = text[index];
                if (character === '"') {
                    if (quoted && text[index + 1] === '"') {
                        value += '"';
                        index += 1;
                    } else quoted = !quoted;
                } else if (character === ',' && !quoted) {
                    row.push(value.trim());
                    value = '';
                } else if (character === '\n' && !quoted) {
                    row.push(value.trim());
                    if (row.some(cell => cell !== '')) rows.push(row);
                    row = [];
                    value = '';
                } else if (character !== '\r') value += character;
            }

            row.push(value.trim());
            if (row.some(cell => cell !== '')) rows.push(row);
            return rows;
        }

        function normalizeSheetImageUrl(value) {
            const url = String(value || '').trim();
            if (!url) return '';
            const fileId = url.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?export=view&id=|thumbnail\?id=)|googleusercontent\.com\/d\/)([^/?&=]+)/)?.[1];
            if (fileId && sheetImageFiles[fileId]) return sheetImageFiles[fileId];
            return fileId ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w1200` : url;
        }

        function updateHeroImage(imageUrl) {
            const image = document.querySelector('.hero-media img');
            if (!image) return;
            const useFallbackImage = () => {
                if (image.getAttribute('src') === '/vehicles/hero.jpg') {
                    image.onerror = () => {
                        image.onerror = null;
                        image.className = 'hero-brand-mark';
                        image.alt = 'Nallavan Rentals';
                        image.src = 'nallavan-logo-transparent.png';
                    };
                    image.src = 'nallavan-logo-transparent.png';
                    return;
                }
                image.className = 'hero-sheet-image';
                image.alt = 'Nallavan Rentals featured rental car';
                image.onerror = useFallbackImage;
                image.src = '/vehicles/hero.jpg';
            };
            const heroUrl = normalizeSheetImageUrl(imageUrl);
            if (!heroUrl) {
                image.className = 'hero-sheet-image';
                image.alt = 'Nallavan Rentals featured rental car';
                image.onerror = useFallbackImage;
                image.src = '/vehicles/hero.jpg';
                return;
            }
            image.className = 'hero-sheet-image';
            image.alt = 'Featured vehicle available for rent';
            image.onerror = useFallbackImage;
            image.src = heroUrl;
        }

        function syncMinimumReturnTime() {
            const fromDate = document.getElementById('fromDate');
            const fromTime = document.getElementById('fromTime');
            const toDate = document.getElementById('toDate');
            const toTime = document.getElementById('toTime');
            if (!fromDate || !fromTime || !toDate || !toTime) return;

            const pickup = new Date(`${fromDate.value}T${fromTime.value || '00:00'}`);
            if (Number.isNaN(pickup.getTime())) {
                toDate.min = fromDate.min || toLocalDateInputValue(new Date());
                toTime.min = '';
                return;
            }

            const minimumReturn = new Date(pickup.getTime() + 12 * 60 * 60 * 1000);
            toDate.min = toLocalDateInputValue(minimumReturn);
            toTime.min = toDate.value === toDate.min
                ? `${String(minimumReturn.getHours()).padStart(2, '0')}:${String(minimumReturn.getMinutes()).padStart(2, '0')}`
                : '';
        }

        function setDefaultReturnTime() {
            const fromDate = document.getElementById('fromDate');
            const fromTime = document.getElementById('fromTime');
            const toDate = document.getElementById('toDate');
            const toTime = document.getElementById('toTime');
            if (!fromDate.value || !fromTime.value) return;

            const pickup = new Date(`${fromDate.value}T${fromTime.value}`);
            if (Number.isNaN(pickup.getTime())) return;
            const defaultReturn = new Date(pickup.getTime() + 24 * 60 * 60 * 1000);
            toDate.value = toLocalDateInputValue(defaultReturn);
            toTime.value = `${String(defaultReturn.getHours()).padStart(2, '0')}:${String(defaultReturn.getMinutes()).padStart(2, '0')}`;
            syncMinimumReturnTime();
            validateDates();
        }

        function handlePickupChange() {
            syncMinimumPickupTime();
            setDefaultReturnTime();
        }

        async function fetchFleetData() {
            if (fleetFetchInProgress) return;
            fleetFetchInProgress = true;
            try {
                const requestUrl = new URL(fleetCsvUrl);
                requestUrl.searchParams.set('_refresh', Date.now());
                const response = await fetch(requestUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Fleet sheet request failed: ${response.status}`);

                const rows = parseCsv((await response.text()).replace(/^\uFEFF/, ''));
                if (rows.length < 2) throw new Error('Fleet sheet has no vehicle rows.');
                const headerIndexes = Object.fromEntries(rows[0].map((header, index) => [header.toLowerCase().replace(/[^a-z0-9]/g, ''), index]));
                const readCell = (row, header) => row[headerIndexes[header]] || '';
                const heroImageUrl = rows.slice(1).map(row => readCell(row, 'heroimageurl')).find(Boolean) || '';
                const imageWarnings = [];
                const vehicles = rows.slice(1).map(row => {
                    const name = readCell(row, 'name').trim();
                    const price = Number(readCell(row, 'priceday').replace(/[^\d.-]/g, ''));
                    const capacity = Number(readCell(row, 'capacity'));
                    const seats = Number(readCell(row, 'seats'));
                    const type = readCell(row, 'type').trim() || 'Car';
                    const normalizedName = name.toLowerCase();
                    const activeValue = readCell(row, 'active').trim().toLowerCase();
                    const sheetImageUrl = readCell(row, 'imageurl');
                    const imageFileId = sheetImageUrl.match(/(?:drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?export=view&id=|thumbnail\?id=)|googleusercontent\.com\/d\/)([^/?&=]+)/)?.[1];
                    const duplicateI20Image = normalizedName === 'i20' && imageFileId === '1ivlm_NwyRZPP-4f0LZlExFElu27pr0dT';
                    const active = !['false', 'no', '0', 'inactive'].includes(activeValue);
                    if (active && name && price > 0) {
                        if (!sheetImageUrl.trim()) imageWarnings.push(`${name}: image URL is blank`);
                        else if (duplicateI20Image) imageWarnings.push(`${name}: image URL is the same as Exter`);
                    }
                    return {
                        name,
                        type,
                        price,
                        seats: Number.isFinite(seats) ? seats : 0,
                        capacity: Number.isFinite(capacity) && capacity > 0 ? capacity : 1,
                        imageUrl: duplicateI20Image ? '' : normalizeSheetImageUrl(sheetImageUrl),
                        calendarName: readCell(row, 'calendarname').trim() || name,
                        active
                    };
                }).filter(vehicle => vehicle.name && Number.isFinite(vehicle.price) && vehicle.price > 0 && vehicle.active);

                if (!vehicles.length) throw new Error('Fleet sheet has no active, valid vehicle rows.');
                const signature = JSON.stringify({ vehicles, heroImageUrl });
                document.getElementById('fleetStatus').innerText = `Google Sheets synced: ${vehicles.length} vehicle prices; ${imageWarnings.length ? `image issue: ${imageWarnings.join('; ')}.` : 'vehicle images ready.'}`;
                hasSheetData = true;
                if (signature === fleetSignature) return;
                fleetSignature = signature;
                fleetVehicles = vehicles;
                updateHeroImage(heroImageUrl);
                renderFleet();
                updateFleetBadges();
                validateDates();
            } catch (error) {
                console.error('Fleet sheet sync error; using local fleet fallback:', error);
                if (!hasSheetData) document.getElementById('fleetStatus').innerText = 'Google Sheets unavailable; showing local fallback prices.';
            } finally {
                fleetFetchInProgress = false;
            }
        }

        function vehicleDisplayName(vehicle) {
            const knownNames = { ertiga: 'Maruti Ertiga', exter: 'Hyundai Exter', i20: 'Hyundai i20' };
            return knownNames[vehicle.name.toLowerCase()] || vehicle.name;
        }

        function vehicleBadgeId(vehicle) {
            return `badge-${vehicle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        }

        function appendBrandPlaceholder(container, altText) {
            const image = document.createElement('img');
            image.src = 'nallavan-logo-transparent.png';
            image.alt = altText;
            image.className = 'fleet-logo-placeholder';
            image.addEventListener('error', () => {
                image.remove();
                appendVehiclePlaceholder(container, 'Car');
            }, { once: true });
            container.appendChild(image);
        }

        function appendVehiclePlaceholder(container, type) {
            const icon = document.createElement('i');
            icon.className = `fa-solid ${type.toLowerCase().includes('bike') ? 'fa-motorcycle' : 'fa-car-side'} text-6xl text-silver/50`;
            icon.setAttribute('aria-hidden', 'true');
            container.classList.add('flex', 'items-center', 'justify-center');
            container.appendChild(icon);
        }

        function renderFleet() {
            const grid = document.getElementById('fleetGrid');
            const select = document.getElementById('carSelect');
            if (!grid || !select) return;

            const activeVehicles = fleetVehicles.filter(vehicle => vehicle.active);
            const previousSelection = select.value;
            grid.replaceChildren();
            select.replaceChildren();

            activeVehicles.forEach((vehicle, index) => {
                const card = document.createElement('article');
                card.className = 'glass-panel fleet-card-enter rounded-lg overflow-hidden group border border-silver/10 relative';
                card.style.setProperty('--card-index', index);

                const badge = document.createElement('div');
                badge.id = vehicleBadgeId(vehicle);
                badge.className = 'absolute top-3 right-3 z-10 px-2 py-1 rounded text-xs font-bold bg-green-500/20 text-green-400 border border-green-500/30';
                badge.textContent = 'Available';
                card.appendChild(badge);

                const visual = document.createElement('div');
                visual.className = 'fleet-card-visual bg-darker border-b border-silver/10 relative';
                if (vehicle.imageUrl) {
                    const image = document.createElement('img');
                    image.src = vehicle.imageUrl;
                    image.alt = `${vehicleDisplayName(vehicle)} available for rent`;
                    image.className = 'fleet-car-image';
                    image.loading = 'lazy';
                    image.decoding = 'async';
                    image.style.objectPosition = vehicle.name.toLowerCase() === 'ertiga' ? 'center 90%' : 'center 80%';
                    image.addEventListener('error', () => {
                        image.remove();
                        appendBrandPlaceholder(visual, `${vehicleDisplayName(vehicle)} image unavailable`);
                    });
                    visual.appendChild(image);
                } else appendBrandPlaceholder(visual, `${vehicleDisplayName(vehicle)} image not provided`);
                card.appendChild(visual);

                const details = document.createElement('div');
                details.className = 'p-5';
                const titleRow = document.createElement('div');
                titleRow.className = 'flex justify-between items-center mb-2 gap-2';
                const title = document.createElement('h4');
                title.className = `text-xl font-bold ${index === 0 ? 'text-gold' : 'text-silver'}`;
                title.textContent = vehicleDisplayName(vehicle);
                const meta = document.createElement('span');
                meta.className = 'text-sm bg-silver/20 px-2 py-1 rounded text-silver';
                meta.textContent = vehicle.seats ? `${vehicle.seats} Seater${vehicle.capacity > 1 ? ` (${vehicle.capacity} ${vehicle.type.toLowerCase()}s)` : ''}` : vehicle.type;
                titleRow.append(title, meta);

                const price = document.createElement('p');
                price.className = 'text-2xl font-bold mb-4';
                price.append(document.createTextNode(`₹${vehicle.price.toLocaleString('en-IN')} `));
                const perDay = document.createElement('span');
                perDay.className = 'text-sm font-normal text-silver';
                perDay.textContent = '/ day';
                price.appendChild(perDay);

                const bookButton = document.createElement('button');
                bookButton.type = 'button';
                bookButton.className = 'w-full bg-silver text-dark py-2 rounded font-semibold hover:bg-white transition';
                bookButton.textContent = 'Book Now';
                bookButton.addEventListener('click', () => selectCar(vehicle.name));
                details.append(titleRow, price, bookButton);
                card.appendChild(details);
                grid.appendChild(card);

                const option = document.createElement('option');
                option.value = vehicle.name;
                option.dataset.price = String(vehicle.price);
                option.textContent = `${vehicleDisplayName(vehicle)} (₹${vehicle.price.toLocaleString('en-IN')}/day)`;
                select.appendChild(option);
            });

            if (activeVehicles.some(vehicle => vehicle.name === previousSelection)) select.value = previousSelection;
            else if (activeVehicles.length) select.value = activeVehicles[0].name;
        }

        window.onload = function() {
            const now = new Date();
            const today = toLocalDateInputValue(now);
            const earliestPickup = getEarliestPickupTime();
            document.getElementById('fromDate').min = today;
            document.getElementById('fromDate').value = today;
            document.getElementById('fromTime').min = toLocalTimeInputValue(earliestPickup);
            document.getElementById('fromTime').value = toLocalTimeInputValue(earliestPickup);
            document.getElementById('toDate').min = today;
            document.getElementById('fromDate').addEventListener('change', handlePickupChange);
            document.getElementById('fromTime').addEventListener('change', handlePickupChange);
            const bookBtn = document.getElementById('bookBtn');
            bookBtn.disabled = true;
            bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
            setDefaultReturnTime();
            renderFleet();
            fetchFleetData();
            window.setInterval(fetchFleetData, 10000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') fetchFleetData();
            });
            window.addEventListener('focus', fetchFleetData);
            const revealTargets = document.querySelectorAll('.hero-copy, .hero-media, #fleet > .container > h3, #fleet > .container > #fleetStatus, #fleet > .container > #calStatus, #quick-book .booking-card, #quick-book .flex.flex-col.gap-6 > .glass-panel, footer');
            if ('IntersectionObserver' in window) {
                const revealObserver = new IntersectionObserver(entries => {
                    entries.forEach(entry => {
                        if (entry.isIntersecting) {
                            entry.target.classList.add('section-revealed');
                            revealObserver.unobserve(entry.target);
                        }
                    });
                }, { threshold: 0.12 });
                revealTargets.forEach(target => {
                    target.classList.add('section-reveal');
                    revealObserver.observe(target);
                });
            }
            fetchCalendarEvents();
            window.setInterval(fetchCalendarEvents, 10000);
        };

        async function fetchCalendarEvents() {
            if (calendarFetchInProgress) return;
            calendarFetchInProgress = true;
            try {
                const requestUrl = new URL(appsScriptUrl);
                requestUrl.searchParams.set('_refresh', Date.now());
                const response = await fetch(requestUrl, { cache: 'no-store' });
                if (!response.ok) throw new Error(`Calendar request failed: ${response.status}`);
                const data = await response.json();
                if (!Array.isArray(data)) throw new Error("Calendar response must be an event array.");
                calendarEvents = data;
                calendarReady = true;
                document.getElementById('calStatus').innerText = "Live calendar synced successfully!";
                updateFleetBadges();
                validateDates();
            } catch (error) {
                console.error("Calendar sync error:", error);
                calendarReady = false;
                document.getElementById('calStatus').innerText = "Calendar unavailable. Please contact us to confirm availability.";
                updateFleetBadges();
            } finally {
                calendarFetchInProgress = false;
            }
        }

        function getBookedCount(carName, checkDate) {
            const check = String(checkDate || '').slice(0, 10);
            let count = 0;
            const vehicle = fleetVehicles.find(item => item.name === carName);
            const calendarName = vehicle?.calendarName || carName;

            calendarEvents.forEach(event => {
                const summary = String(event.title || event.summary || '').toLowerCase();
                const start = String(event.start || event.startDate || '').slice(0, 10);
                const end = String(event.end || event.endDate || start).slice(0, 10);
                if (!start || !eventMatchesCar(summary, calendarName)) return;

                const startDate = parseLocalDate(start);
                const endDate = parseLocalDate(end);
                const checkDateValue = parseLocalDate(check);
                const inRange = checkDateValue && startDate && endDate && checkDateValue >= startDate && checkDateValue <= endDate;

                if (!inRange) return;
                if (vehicle?.capacity > 1) {
                    const normalizedCalendarName = calendarName.toLowerCase();
                    const hasVehicleNumber = summary.includes(`${normalizedCalendarName} 1`) || summary.includes(`${normalizedCalendarName} 2`);
                    count += hasVehicleNumber ? 1 : vehicle.capacity;
                } else count += 1;
            });
            return count;
        }

        function eventMatchesCar(summary, carName) {
            const calendarName = String(carName || '').toLowerCase().trim();
            return Boolean(calendarName && summary.includes(calendarName));
        }

        function getUpcomingBookedDates(carName) {
            const today = dateKey(new Date());
            const dates = new Set();
            const vehicle = fleetVehicles.find(item => item.name === carName);
            const calendarName = vehicle?.calendarName || carName;
            calendarEvents.forEach(event => {
                const summary = String(event.title || event.summary || '').toLowerCase();
                const start = String(event.start || event.startDate || '').slice(0, 10);
                const end = String(event.end || event.endDate || start).slice(0, 10);
                if (!start || end < today || !eventMatchesCar(summary, calendarName)) return;

                const current = new Date(`${(start < today ? today : start)}T12:00:00`);
                const last = new Date(`${end}T12:00:00`);
                while (current <= last) {
                    dates.add(dateKey(current));
                    current.setDate(current.getDate() + 1);
                }
            });
            return [...dates].sort();
        }

        function dateKey(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        function formatDate(date) {
            return new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
        }

        function formatDateRange(dates) {
            if (dates.length === 1) return formatDate(dates[0]);
            const first = new Date(`${dates[0]}T12:00:00`);
            const last = new Date(`${dates[dates.length - 1]}T12:00:00`);
            const consecutive = dates.every((date, index) => {
                if (index === 0) return true;
                const previous = new Date(`${dates[index - 1]}T12:00:00`);
                previous.setDate(previous.getDate() + 1);
                return dateKey(previous) === date;
            });
            if (!consecutive) return dates.map(formatDate).join(', ');
            if (first.getFullYear() === last.getFullYear() && first.getMonth() === last.getMonth()) {
                return `${first.getDate()}-${last.getDate()} ${first.toLocaleDateString('en-IN', { month: 'short' })}`;
            }
            return `${formatDate(dates[0])}-${formatDate(dates[dates.length - 1])}`;
        }

        function getSelectedDateRange() {
            const from = document.getElementById('fromDate').value;
            const to = document.getElementById('toDate').value;
            const hasSelection = Boolean(from || to);
            if (!hasSelection) return { dates: [], hasSelection: false };
            const start = from || to;
            const end = to || from;
            if (start > end) return null;

            const dates = [];
            const current = new Date(`${start}T12:00:00`);
            const last = new Date(`${end}T12:00:00`);
            while (current <= last) {
                dates.push(dateKey(current));
                current.setDate(current.getDate() + 1);
            }
            return { dates, hasSelection };
        }

        function updateFleetBadges() {
            const range = getSelectedDateRange();
            const cars = fleetVehicles;

            if (calendarReady && range && range.hasSelection) {
                const first = formatDate(range.dates[0]);
                const last = formatDate(range.dates[range.dates.length - 1]);
                document.getElementById('calStatus').innerText = `Live calendar · Checking ${first}${first === last ? '' : ` to ${last}`} · refreshes every 10 sec`;
            } else if (calendarReady && range) {
                document.getElementById('calStatus').innerText = 'Live calendar · Upcoming bookings · refreshes every 10 sec';
            }

            cars.forEach(car => {
                const badge = document.getElementById(vehicleBadgeId(car));
                if (!badge) return;
                let text = 'Check calendar';
                let color = 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';

                if (calendarReady && !range) {
                    text = 'Choose valid dates';
                } else if (calendarReady) {
                    const dates = range.hasSelection ? range.dates : getUpcomingBookedDates(car.name);
                    const bookedDates = dates.filter(date => getBookedCount(car.name, date) >= car.capacity);
                    const partialDates = car.capacity > 1 ? dates.filter(date => {
                        const booked = getBookedCount(car.name, date);
                        return booked > 0 && booked < car.capacity;
                    }) : [];

                    if (bookedDates.length) {
                        text = `Booked ${formatDateRange(bookedDates)}`;
                        color = 'bg-red-500/20 text-red-400 border-red-500/30';
                    } else if (partialDates.length) {
                        const bookedCount = getBookedCount(car.name, partialDates[0]);
                        text = `${bookedCount}/${car.capacity} booked · ${formatDateRange(partialDates)}`;
                        color = 'bg-yellow-500/25 text-yellow-400 border-yellow-500/30';
                    } else {
                        text = 'Available';
                        color = 'bg-green-500/20 text-green-400 border-green-500/30';
                    }
                }

                badge.innerText = text;
                badge.className = `absolute top-3 right-3 z-10 px-2 py-1 rounded text-xs font-bold border ${color}`;
            });
        }

        function selectCar(carName, price) {
            const select = document.getElementById('carSelect');
            select.value = carName;
            validateDates();
            document.getElementById('quick-book').scrollIntoView({ behavior: 'smooth' });
        }

        function validateDates() {
            syncMinimumPickupTime();
            syncMinimumReturnTime();
            updateFleetBadges();
            const fromDateStr = document.getElementById('fromDate').value;
            const toDateStr = document.getElementById('toDate').value;
            const select = document.getElementById('carSelect');
            const carName = select.value;
            const selectedVehicle = fleetVehicles.find(vehicle => vehicle.name === carName);
            const pricePerDay = Number(select.options[select.selectedIndex]?.dataset.price || selectedVehicle?.price || 0);
            const displayDays = document.getElementById('displayDays');
            const displayPrice = document.getElementById('displayPrice');
            const errorMsg = document.getElementById('errorMsg');
            const bookBtn = document.getElementById('bookBtn');

            if (!fromDateStr || !toDateStr) {
                displayDays.innerText = "0 Days";
                displayPrice.innerText = "₹0";
                errorMsg.classList.add('hidden');
                bookBtn.disabled = true;
                bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return null;
            }

            const fromDate = parseLocalDate(fromDateStr);
            const toDate = parseLocalDate(toDateStr);

            if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || toDate < fromDate) {
                errorMsg.innerText = "'To Date' must be after or equal to 'From Date'.";
                errorMsg.classList.remove('hidden');
                displayDays.innerText = "0 Days";
                displayPrice.innerText = "₹0";
                bookBtn.disabled = true;
                bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return null;
            }

            const fromTimeStr = document.getElementById('fromTime').value;
            const toTimeStr = document.getElementById('toTime').value;
            const pickup = new Date(`${fromDateStr}T${fromTimeStr}`);
            const returnTime = new Date(`${toDateStr}T${toTimeStr}`);
            const earliestPickup = getEarliestPickupTime();
            if (pickup < earliestPickup) {
                errorMsg.innerText = 'Pickup date and time cannot be earlier than the current time.';
                errorMsg.classList.remove('hidden');
                displayDays.innerText = "0 Days";
                displayPrice.innerText = "₹0";
                bookBtn.disabled = true;
                bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
                return null;
            }
            const durationMs = returnTime - pickup;
            const hours = durationMs / (1000 * 60 * 60);
            const fullDays = Math.floor(hours / 24);
            const extraHours = Math.ceil(hours % 24);
            const totalPrice = hours < 24
                ? pricePerDay * (0.8 + Math.max(0, hours - 12) / 12 * 0.2)
                : (fullDays * pricePerDay) + (extraHours * pricePerDay / 24);
            const durationLabel = `${fullDays ? `${fullDays} Day${fullDays === 1 ? '' : 's'}` : ''}${fullDays && extraHours ? ' ' : ''}${extraHours ? `${extraHours} Hour${extraHours === 1 ? '' : 's'}` : ''}`;

            if (durationMs >= 12 * 60 * 60 * 1000) {
                let hasConflict = false;
                let curr = new Date(pickup.getFullYear(), pickup.getMonth(), pickup.getDate());
                const lastDate = new Date(returnTime.getFullYear(), returnTime.getMonth(), returnTime.getDate());
                while (curr <= lastDate) {
                    const dateStr = toLocalDateInputValue(curr);
                    const bookedCount = getBookedCount(carName, dateStr);
                    const maxCapacity = selectedVehicle?.capacity || 1;
                    if (bookedCount >= maxCapacity) {
                        hasConflict = true;
                        break;
                    }
                    curr = addDays(curr, 1);
                }

                if (hasConflict) {
                    errorMsg.innerText = `Selected vehicle (${carName}) is FULLY BOOKED on one or more of these dates! Please choose different dates.`;
                    errorMsg.classList.remove('hidden');
                    displayDays.innerText = "0 Days";
                    displayPrice.innerText = "₹0";
                    bookBtn.disabled = true;
                    bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    return null;
                }

                errorMsg.classList.add('hidden');
                displayDays.innerText = durationLabel;
                displayPrice.innerText = "₹" + Math.round(totalPrice).toLocaleString('en-IN');
                bookBtn.disabled = false;
                bookBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                return { days: durationLabel, price: Math.round(totalPrice) };
            }

            errorMsg.innerText = durationMs > 0
                ? 'Minimum rental duration is 12 hours.'
                : 'Return date and time must be after pickup date and time.';
            errorMsg.classList.remove('hidden');
            displayDays.innerText = "0 Days";
            displayPrice.innerText = "₹0";
            bookBtn.disabled = true;
            bookBtn.classList.add('opacity-50', 'cursor-not-allowed');
            return null;
        }

        function bookViaWhatsApp() {
            const carName = document.getElementById('carSelect').value;
            const fromDate = document.getElementById('fromDate').value;
            const fromTime = document.getElementById('fromTime').value;
            const toDate = document.getElementById('toDate').value;
            const toTime = document.getElementById('toTime').value;
            const calcResult = validateDates();
            if (!calcResult) return;
            const message = `Hi Nallavan Rentals,\nI would like to request a booking.\n\n*Vehicle:* ${carName}\n*From:* ${fromDate} (${fromTime})\n*To:* ${toDate} (${toTime})\n*Total Duration:* ${calcResult.days}\n*Estimated Price:* ₹${calcResult.price.toLocaleString('en-IN')}\n\nPlease confirm my booking!`;
            const whatsappNumber = "919003582016";
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');
        }
    

