# LocationRequestSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**entity_id** | **str** | Unique identifier for the entity | 
**entity_type** | **str** | Type of entity | 
**metadata** | **object** | Additional metadata | [optional] 
**node_id** | **str** | Node ID (optional - will use current node if not provided) | [optional] 
**position** | [**Position**](Position.md) |  | 

## Example

```python
from nexum-api-client.models.location_request_schema import LocationRequestSchema

# TODO update the JSON string below
json = "{}"
# create an instance of LocationRequestSchema from a JSON string
location_request_schema_instance = LocationRequestSchema.from_json(json)
# print the JSON string representation of the object
print LocationRequestSchema.to_json()

# convert the object into a dict
location_request_schema_dict = location_request_schema_instance.to_dict()
# create an instance of LocationRequestSchema from a dict
location_request_schema_form_dict = location_request_schema.from_dict(location_request_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


