import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class TilesService {
    /**
     * Get metadata from raster MBTiles file
     * Retrieve metadata information from the raster MBTiles file
     * @returns any Metadata retrieved successfully
     * @throws ApiError
     */
    static getApiTilesRasterMetadata() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/raster/metadata',
            errors: {
                503: `Raster tiles service not available`,
            },
        });
    }
    /**
     * Get TileJSON representation of the raster MBTiles
     * Retrieve TileJSON specification for the raster MBTiles map (used by Leaflet and other map clients)
     * @returns any TileJSON retrieved successfully
     * @throws ApiError
     */
    static getApiTilesRasterTilejson() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/raster/tilejson',
            errors: {
                503: `Raster tiles service not available`,
            },
        });
    }
    /**
     * Serve a raster map tile from MBTiles
     *
     * Args:
     * z: Zoom level
     * x: Tile X coordinate
     * y: Tile Y coordinate
     * ext: File extension (png, jpg, etc.)
     * Retrieve a raster map tile image (PNG/JPEG) for the given zoom level and coordinates
     * @param z Zoom level
     * @param x Tile X coordinate
     * @param y Tile Y coordinate
     * @param ext Image format extension
     * @returns binary Tile image
     * @throws ApiError
     */
    static getApiTilesRaster(z, x, y, ext) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/raster/{z}/{x}/{y}',
            path: {
                'z': z,
                'x': x,
                'y': y,
                'ext': ext,
            },
            errors: {
                503: `Raster tiles service not available`,
            },
        });
    }
    /**
     * Serve a raster map tile from MBTiles
     *
     * Args:
     * z: Zoom level
     * x: Tile X coordinate
     * y: Tile Y coordinate
     * ext: File extension (png, jpg, etc.)
     * Retrieve a raster map tile image (PNG/JPEG) for the given zoom level and coordinates
     * @param z Zoom level
     * @param x Tile X coordinate
     * @param y Tile Y coordinate
     * @param ext Image format extension
     * @returns binary Tile image
     * @throws ApiError
     */
    static getApiTilesRaster1(z, x, y, ext) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/raster/{z}/{x}/{y}.{ext}',
            path: {
                'z': z,
                'x': x,
                'y': y,
                'ext': ext,
            },
            errors: {
                503: `Raster tiles service not available`,
            },
        });
    }
    /**
     * Get metadata from vector MBTiles file
     * Retrieve metadata information from the vector MBTiles file, including vector_layers information
     * @returns any Metadata retrieved successfully
     * @throws ApiError
     */
    static getApiTilesVectorMetadata() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/vector/metadata',
            errors: {
                503: `Vector tiles service not available`,
            },
        });
    }
    /**
     * Get auto-generated MapLibre GL JS style from vector_layers metadata
     * Generate a MapLibre GL JS style from vector_layers metadata with sensible defaults
     * @returns any MapLibre GL JS style retrieved successfully
     * @throws ApiError
     */
    static getApiTilesVectorStyle() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/vector/style',
            errors: {
                503: `Vector tiles service not available`,
            },
        });
    }
    /**
     * Get TileJSON representation of the vector MBTiles
     * Retrieve TileJSON specification for the vector MBTiles map (used by MapLibre GL JS and other map clients)
     * @returns any TileJSON retrieved successfully
     * @throws ApiError
     */
    static getApiTilesVectorTilejson() {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/vector/tilejson',
            errors: {
                503: `Vector tiles service not available`,
            },
        });
    }
    /**
     * Serve a vector map tile (PBF) from MBTiles
     *
     * Args:
     * z: Zoom level
     * x: Tile X coordinate
     * y: Tile Y coordinate
     * Retrieve a vector map tile (PBF/MVT format) for the given zoom level and coordinates. Tiles are automatically decompressed if gzip-compressed.
     * @param z Zoom level
     * @param x Tile X coordinate
     * @param y Tile Y coordinate
     * @returns binary Vector tile (PBF format, uncompressed)
     * @throws ApiError
     */
    static getApiTilesVector(z, x, y) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/vector/{z}/{x}/{y}',
            path: {
                'z': z,
                'x': x,
                'y': y,
            },
            errors: {
                503: `Vector tiles service not available`,
            },
        });
    }
    /**
     * Serve a vector map tile (PBF) from MBTiles
     *
     * Args:
     * z: Zoom level
     * x: Tile X coordinate
     * y: Tile Y coordinate
     * Retrieve a vector map tile (PBF/MVT format) for the given zoom level and coordinates. Tiles are automatically decompressed if gzip-compressed.
     * @param z Zoom level
     * @param x Tile X coordinate
     * @param y Tile Y coordinate
     * @returns binary Vector tile (PBF format, uncompressed)
     * @throws ApiError
     */
    static getApiTilesVectorPbf(z, x, y) {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/tiles/vector/{z}/{x}/{y}.pbf',
            path: {
                'z': z,
                'x': x,
                'y': y,
            },
            errors: {
                503: `Vector tiles service not available`,
            },
        });
    }
}
