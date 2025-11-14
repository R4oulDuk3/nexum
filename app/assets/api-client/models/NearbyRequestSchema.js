export var NearbyRequestSchema;
(function (NearbyRequestSchema) {
    /**
     * Filter by entity type (optional)
     */
    let entity_type;
    (function (entity_type) {
        entity_type["RESPONDER"] = "responder";
        entity_type["CIVILIAN"] = "civilian";
        entity_type["INCIDENT"] = "incident";
        entity_type["RESOURCE"] = "resource";
        entity_type["HAZARD"] = "hazard";
    })(entity_type = NearbyRequestSchema.entity_type || (NearbyRequestSchema.entity_type = {}));
})(NearbyRequestSchema || (NearbyRequestSchema = {}));
