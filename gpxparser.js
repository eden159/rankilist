class GPXParser extends EventTarget {
    constructor(inputId, distanceThreshold, distanceSlopeSectionThreshold = 50, elevationDistanceThreshold = 0) {
        super();
        this.fileInput = document.getElementById(inputId);
        this.distanceThreshold = distanceThreshold; // Threshold for filtering points
        this.distanceSlopeSectionThreshold = distanceSlopeSectionThreshold; // Threshold for minimal distance for segments
        this.elevationDistanceThreshold = elevationDistanceThreshold; // Threshold for minimal accumulated distance for denivelation
        if (this.fileInput) {
            this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        } else {
            console.error(`Елемент с id "${inputId}" не е намерен.`);
        }
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => this.parseGPX(e.target.result);
            reader.readAsText(file);
        }
    }

    parseGPX(gpxText) {
        const parser = new DOMParser();
        const gpxDoc = parser.parseFromString(gpxText, 'application/xml');
        const geojson = toGeoJSON.gpx(gpxDoc);

        this.filterPoints(geojson.features[0].geometry.coordinates);
    }

    filterPoints(coordinates) {
        let i = 0; // Start from the first element
        let distance;

        while (i < coordinates.length) {
            const [lon1, lat1, ele1] = coordinates[i];
            let conditionMet = false;

            // Loop through all elements after the current one
            for (let j = i + 1; j < coordinates.length; j++) {
                const [lon2, lat2, ele2] = coordinates[j];
                distance = this.haversineDistance(lat1, lon1, lat2, lon2);

                // if we are above the distance threshold, break the loop
                if (distance >= this.distanceThreshold) {
                    conditionMet = true;
                    i = j; // Continue from the last element that met the condition
                    break;
                }
            }

            // If no element meets the condition, remove the current element
            if (!conditionMet) {
                coordinates.splice(i, 1);
            }
        }

        this.processData(coordinates);
    }

    processData(coordinates) {

        let totalDistance = 0; // в метри
        let totalAscent = 0;   // в метри
        let totalDescent = 0;  // в метри

        const ascentSegments = {
            '0-5': { count: 0, totalLength: 0 },
            '5-10': { count: 0, totalLength: 0 },
            '10-15': { count: 0, totalLength: 0 },
            '15-20': { count: 0, totalLength: 0 },
            '20-25': { count: 0, totalLength: 0 },
            '25-30': { count: 0, totalLength: 0 },
            '30+': { count: 0, totalLength: 0 },
        };

        const descentSegments = {
            '0-5': { count: 0, totalLength: 0 },
            '5-10': { count: 0, totalLength: 0 },
            '10-15': { count: 0, totalLength: 0 },
            '15-20': { count: 0, totalLength: 0 },
            '20-25': { count: 0, totalLength: 0 },
            '25-30': { count: 0, totalLength: 0 },
            '30+': { count: 0, totalLength: 0 },
        };

        // Accumulator for total denivelation
        let elevationAccumulator = {
            accumulatedDistance: 0,
            lastElevation: 0,
        };

        let averageElevation = {
            count: 0,
            totalElevation: 0,
        };

        // Current segment for slopes
        let currentSegment = {
            accumulatedDistance: 0,
            accumulatedElevationChange: 0,
            category: null,
            isAscent: null,
        };

        for (let i = 1; i < coordinates.length; i++) {
            const [lon1, lat1, ele1] = coordinates[i - 1];
            const [lon2, lat2, ele2] = coordinates[i];

            if (i === 1) {
                averageElevation.totalElevation += ele1;
                averageElevation.count += 1;
            }

            averageElevation.totalElevation += ele2;
            averageElevation.count += 1;

            if (i === 1) {
                elevationAccumulator.lastElevation = ele1;
            }

            const distance = this.haversineDistance(lat1, lon1, lat2, lon2);

            if (distance === 0) continue;

            const elevationChange = ele2 - ele1;

            totalDistance += distance;

            // Calculate the elevation change with applying the thresholds
            elevationAccumulator.accumulatedDistance += distance;

            if (elevationAccumulator.accumulatedDistance >= this.elevationDistanceThreshold) {

                const elevationAccumulatorChange = ele2 - elevationAccumulator.lastElevation;

                if (elevationAccumulatorChange > 0) {
                    totalAscent += elevationAccumulatorChange;
                } else if (elevationAccumulatorChange < 0) {
                    totalDescent += Math.abs(elevationAccumulatorChange);
                }

                // Reset the accumulator
                elevationAccumulator.accumulatedDistance = 0;
                elevationAccumulator.lastElevation = ele2;
            }

            // Calculate the slopes without applying the thresholds
            currentSegment.accumulatedDistance += distance;
            currentSegment.accumulatedElevationChange += elevationChange;

            // Calculate the slope for the current segment
            const slope = (currentSegment.accumulatedElevationChange / currentSegment.accumulatedDistance) * 100;
            const absSlope = Math.abs(slope);

            // Determine the category of the slope
            let category;
            switch (true) {
                case absSlope <= 5:
                    category = '0-5';
                    break;
                case absSlope > 5 && absSlope <= 10:
                    category = '5-10';
                    break;
                case absSlope > 10 && absSlope <= 15:
                    category = '10-15';
                    break;
                case absSlope > 15 && absSlope <= 20:
                    category = '15-20';
                    break;
                case absSlope > 20 && absSlope <= 25:
                    category = '20-25';
                    break;
                case absSlope > 25 && absSlope <= 30:
                    category = '25-30';
                    break;
                default:
                    category = '30+';
                    break;
            }

            const isAscent = currentSegment.accumulatedElevationChange >= 0;

            if (currentSegment.category === null) {
                // First segment
                currentSegment.category = category;
                currentSegment.isAscent = isAscent;
                continue;
            }

            // Saving the segment
            if (currentSegment.accumulatedDistance >= this.distanceSlopeSectionThreshold) {
                if (currentSegment.isAscent) {
                    ascentSegments[currentSegment.category].count += 1;
                    ascentSegments[currentSegment.category].totalLength += currentSegment.accumulatedDistance;
                } else {
                    descentSegments[currentSegment.category].count += 1;
                    descentSegments[currentSegment.category].totalLength += currentSegment.accumulatedDistance;
                }

                // Start a new segment
                currentSegment = {
                    accumulatedDistance: 0,
                    accumulatedElevationChange: 0,
                    category: category,
                    isAscent: isAscent,
                };
            } else if (category !== currentSegment.category || isAscent !== currentSegment.isAscent) {
                // change the segment type
                currentSegment.category = category;
                currentSegment.isAscent = isAscent;
            }
        }

        // Save the last segment
        if (currentSegment.isAscent) {
            ascentSegments[currentSegment.category].count += 1;
            ascentSegments[currentSegment.category].totalLength += currentSegment.accumulatedDistance;
        } else {
            descentSegments[currentSegment.category].count += 1;
            descentSegments[currentSegment.category].totalLength += currentSegment.accumulatedDistance;
        }

        const ascentData = {};
        for (let key in ascentSegments) {
            ascentData[key] = {
                count: ascentSegments[key].count,
                totalLength: ascentSegments[key].totalLength
            };
        }

        const descentData = {};
        for (let key in descentSegments) {
            descentData[key] = {
                count: descentSegments[key].count,
                totalLength: descentSegments[key].totalLength
            };
        }

        // Send an event with the calculated data
        this.dispatchEvent(new CustomEvent('gpxRouteInfoEvent', {
            detail: {
                distance: (totalDistance / 1000), // in kilometers
                denivelation: {
                    ascent: totalAscent,
                    descent: totalDescent
                },
                ascentSegments: ascentData,
                descentSegments: descentData,
                averageElevation: Math.round(averageElevation.totalElevation / averageElevation.count),
            }
        }))
    }

    haversineDistance(lat1, lon1, lat2, lon2) {
        const toRad = (x) => x * Math.PI / 180;

        const R = 6371000; // Radius of the Earth in meters
        const φ1 = toRad(lat1);
        const φ2 = toRad(lat2);
        const Δφ = toRad(lat2 - lat1);
        const Δλ = toRad(lon2 - lon1);

        const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;

        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // in meters
    }
}
