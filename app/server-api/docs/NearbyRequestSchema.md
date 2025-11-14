# NearbyRequestSchema


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**center** | [**Position**](Position.md) |  | 
**entity_type** | **str** | Filter by entity type (optional) | [optional] 
**radius_km** | **float** | Search radius in kilometers | 

## Example

```python
from nexum-api-client.models.nearby_request_schema import NearbyRequestSchema

# TODO update the JSON string below
json = "{}"
# create an instance of NearbyRequestSchema from a JSON string
nearby_request_schema_instance = NearbyRequestSchema.from_json(json)
# print the JSON string representation of the object
print NearbyRequestSchema.to_json()

# convert the object into a dict
nearby_request_schema_dict = nearby_request_schema_instance.to_dict()
# create an instance of NearbyRequestSchema from a dict
nearby_request_schema_form_dict = nearby_request_schema.from_dict(nearby_request_schema_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


